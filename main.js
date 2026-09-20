const { app, BrowserWindow, ipcMain, shell, net, session, Notification, Menu, MenuItem, safeStorage } = require('electron');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');

// --- OAuth loopback constants ---
// Shipping model: the app carries its own OAuth credentials, so a user only
// ever presses "connect" - no Google Cloud project and no setup screen.
// Both values live in the bundled `main.js` (the only file in build.files that
// can hold them). A developer who wants to test with a different client can
// point at one with the git-ignored file next to the app, which is NOT packaged:
//   google-oauth.local.json  ->  { "clientId": "...", "clientSecret": "..." }
const OAUTH_DEFAULT_CLIENT_ID = '668274727663-hr2ie72vv4naboffhjvvp0rtpeh7ema0.apps.googleusercontent.com';

// Client secret of an INSTALLED (Desktop) OAuth client. For installed apps
// Google treats this value as non-confidential (RFC 8252, "OAuth 2.0 for Native
// Apps"): it ships inside every copy of the app and cannot be hidden from a
// determined user. It is intentionally NOT hardcoded here (this file is public
// source, tracked in git) - it is supplied at build/run time via the
// git-ignored google-oauth.local.json next to this file (see
// readOAuthCredentials() below), which electron-builder still bundles into the
// packaged app from the maintainer's machine. Without that file present,
// Google-backup features degrade gracefully (the connect button will fail
// with a clear error instead of silently using a real secret from git).
const OAUTH_DEFAULT_CLIENT_SECRET = '';

/**
 * Optional developer override file, re-read on every call. It is deliberately
 * the ONLY file consulted: a leftover `google-oauth-client.json` written by an
 * older build in userData would otherwise shadow the bundled secret with a
 * stale value and silently break the connection for that user.
 */
function oauthCredentialFiles() {
    return [path.join(__dirname, 'google-oauth.local.json')];
}

/**
 * Resolves the credentials on EVERY call rather than once at startup, so a
 * locally overridden value takes effect immediately. The override file wins
 * when it has a non-empty value; otherwise the credentials baked into this
 * file are used.
 */
function readOAuthCredentials() {
    let clientId = '';
    let clientSecret = '';
    for (const file of oauthCredentialFiles()) {
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!clientId) clientId = String(raw.clientId || raw.client_id || '').trim();
            if (!clientSecret) clientSecret = String(raw.clientSecret || raw.client_secret || '').trim();
        } catch (e) { /* file missing or unreadable - try the next one */ }
    }
    return {
        clientId: clientId || OAUTH_DEFAULT_CLIENT_ID,
        clientSecret: clientSecret || OAUTH_DEFAULT_CLIENT_SECRET
    };
}

function oauthClientId() { return readOAuthCredentials().clientId; }
function oauthClientSecret() { return readOAuthCredentials().clientSecret; }
const OAUTH_REDIRECT_PORT = 8471;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// IMPORTANT: keep this NON-SENSITIVE. sheets.googleapis.com accepts the drive.file
// scope for spreadsheets the app itself created, and drive.file is classified as
// "Recommended / Non-sensitive" by Google. Requesting .../auth/spreadsheets instead
// is a SENSITIVE scope, which forces Google's OAuth verification review and makes
// the consent screen show "Google hasn't verified this app" for every user.
// https://developers.google.com/workspace/sheets/api/scopes
//
// The calendar scope (added for the Calendar-sync feature, docs/GOOGLE_CALENDAR_SPEC.md)
// is itself non-sensitive, but it is a SCOPE ADDITION: a user who connected before
// this change has a refresh token that does not cover it. Google does not silently
// grant new scopes to an old token - she must reconnect once to consent to it. The
// renderer detects this (oauth-status has no calendarId yet despite being connected)
// and prompts for that one-time re-consent rather than assuming access.
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar';
const OAUTH_TIMEOUT_MS = 120000;

/**
 * Appends a breadcrumb to userData/oauth-debug.log. When a consent-screen step
 * fails there is usually nothing on screen to inspect afterwards, so this file
 * is the only record. Logging must never break the flow it is observing.
 */
function appendOAuthLog(message) {
    try {
        const file = path.join(app.getPath('userData'), 'oauth-debug.log');
        fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
    } catch (e) { /* best-effort only */ }
}

function logToWindow(kind, message) {
    appendOAuthLog(`${kind}: ${message}`);
    try {
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0 && wins[0].webContents && !wins[0].webContents.isDestroyed()) {
            wins[0].webContents.send('oauth-log', `[OAuth] ${message}`);
        }
    } catch (e) { /* window may be closing */ }
}

function addAuthHeaderToRequests(details, callback) {
    if (details.url.startsWith('https://sheets.googleapis.com/')
        || details.url.startsWith('https://www.googleapis.com/upload/drive/v3/files')
        || details.url.startsWith('https://www.googleapis.com/calendar/v3/'))
 {
        const t = getAccessToken();
        if (t) {
            callback({ requestHeaders: Object.assign({}, details.requestHeaders, { Authorization: `Bearer ${t}` }) });
            return;
        }
    }
    callback({ requestHeaders: details.requestHeaders });
}

function getAccessToken() {
    try {
        const stored = readStore();
        if (stored && stored.token && stored.expiry > Date.now() + 60000) {
            return stored.token;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// --- OAuth token store (persisted in userData) ---
const STORE_PATH = () => path.join(app.getPath('userData'), 'google-oauth-store.json');

// The OAuth store on disk holds a Google refresh token - a credential that
// by itself grants ongoing access to the user's backup spreadsheet. It is
// encrypted at rest with the OS's own secret store (Windows DPAPI / macOS
// Keychain / Linux libsecret via safeStorage), tied to this OS user account,
// rather than a fixed key that would simply sit readable in the app's source.
const SAFE_STORAGE_PREFIX = 'enc:';

function encryptForStore(text) {
    if (!text) return text;
    if (safeStorage.isEncryptionAvailable()) {
        try {
            return SAFE_STORAGE_PREFIX + safeStorage.encryptString(text).toString('base64');
        } catch (err) {
            console.error('safeStorage encryption failed:', err);
        }
    }
    return text;
}

function decryptForStore(text) {
    if (!text) return text;
    if (typeof text === 'string' && text.startsWith(SAFE_STORAGE_PREFIX)) {
        try {
            const buf = Buffer.from(text.slice(SAFE_STORAGE_PREFIX.length), 'base64');
            return safeStorage.decryptString(buf);
        } catch (err) {
            console.error('safeStorage decryption failed:', err);
            return '';
        }
    }
    return text; // legacy plaintext value, from before this was encrypted
}

function readStore() {
    try {
        const raw = JSON.parse(fs.readFileSync(STORE_PATH(), 'utf8'));
        return Object.assign({}, raw, {
            token: decryptForStore(raw.token),
            refreshToken: decryptForStore(raw.refreshToken)
        });
    } catch (e) {
        return {};
    }
}

function writeStore(patch) {
    const next = Object.assign({}, readStore(), patch);
    const onDisk = Object.assign({}, next, {
        token: encryptForStore(next.token),
        refreshToken: encryptForStore(next.refreshToken)
    });
    try {
        fs.mkdirSync(path.dirname(STORE_PATH()), { recursive: true });
        fs.writeFileSync(STORE_PATH(), JSON.stringify(onDisk, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to persist OAuth store:', e);
    }
    return next; // callers get the plaintext-in-memory shape back
}

/**
 * Returns a valid access token, refreshing via refresh_token when needed.
 * Returns null when offline / refresh failed / never connected.
 */
async function ensureFreshToken() {
    const store = readStore();
    if (!store.refreshToken) return null;
    if (store.token && store.expiry && store.expiry > Date.now() + 60000) return store.token;

    try {
        const refreshBody = {
            client_id: oauthClientId(),
            refresh_token: store.refreshToken,
            grant_type: 'refresh_token'
        };
        const refreshSecret = oauthClientSecret();
        if (refreshSecret) refreshBody.client_secret = refreshSecret;

        const res = await fetch(OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(refreshBody).toString()
        });
        if (!res.ok) {
            logToWindow('oauth', `רענון טוקן נכשל (HTTP ${res.status})`);
            return null;
        }
        const data = await res.json();
        if (!data.access_token) return null;
        writeStore({ token: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000 });
        return data.access_token;
    } catch (e) {
        logToWindow('oauth', 'רענון טוקן נכשל - בדוק חיבור לאינטרנט');
        return null;
    }
}

async function exchangeCodeForTokens(code, codeVerifier) {
    const body = {
        code,
        client_id: oauthClientId(),
        redirect_uri: `http://127.0.0.1:${OAUTH_REDIRECT_PORT}`,
        grant_type: 'authorization_code'
    };
    // PKCE: Google requires a code_verifier for installed-app clients.
    // If the verifier is missing from the request, the exchange fails.
    if (codeVerifier) body.code_verifier = codeVerifier;

    // Google replies "invalid_request: client_secret is missing" when the
    // client was issued a secret (Web-application clients in particular).
    const clientSecret = oauthClientSecret();
    if (clientSecret) body.client_secret = clientSecret;

    const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
    });
    if (!res.ok) {
        // Surface Google's own error text so the failure is diagnosable
        // (e.g. redirect_uri_mismatch / invalid_client / invalid_grant).
        let detail = '';
        try {
            const raw = await res.text();
            const parsed = JSON.parse(raw);
            detail = parsed.error ? `${parsed.error}: ${parsed.error_description || ''}`.trim() : raw.slice(0, 300);
        } catch (e) { /* body was not JSON */ }
        if (/client_secret is missing/i.test(detail)) {
            detail += ' || חסר סוד לקוח מובנה באפליקציה (OAUTH_DEFAULT_CLIENT_SECRET)';
        }
        appendOAuthLog(`token exchange HTTP ${res.status} :: ${detail}`);
        throw new Error(`token_exchange_failed_${res.status}|${detail}`);
    }
    const data = await res.json();
    if (!data.access_token || !data.refresh_token) throw new Error('missing_tokens');

    let email = '';
    try {
        const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });
        if (ui.ok) {
            const info = await ui.json();
            email = info.email || '';
        }
    } catch (e) { /* non-fatal */ }

    // Google's token response echoes back the scopes actually granted (a user
    // can uncheck one on the consent screen). Stored so the renderer can tell
    // "connected, but never consented to calendar access" apart from a real
    // API failure, and prompt for the one-time re-consent instead of guessing.
    const next = writeStore({
        token: data.access_token,
        refreshToken: data.refresh_token,
        expiry: Date.now() + (data.expires_in || 3600) * 1000,
        email,
        grantedScopes: data.scope || '',
        connectedAt: new Date().toISOString()
    });
    logToWindow('oauth', `התחברות הושלמה${email ? ' לחשבון ' + email : ''}`);
    return { email, spreadsheetId: next.spreadsheetId || '', sheetId: next.sheetId || '' };
}

/**
 * Runs the full loopback OAuth flow: opens the default browser,
 * catches the redirect on 127.0.0.1:<port> and exchanges the code.
 */
// The in-flight flow, if any. A flow keeps the loopback port bound until it
// settles, so a new attempt must cancel it first or it fails with EADDRINUSE.
let activeOAuthFlow = null;

// How long to keep trying to bind the loopback port when it is still busy.
const OAUTH_LISTEN_RETRIES = 10;
const OAUTH_LISTEN_RETRY_MS = 400;

function startOAuthFlow(loginHint) {
    return new Promise((resolve, reject) => {
        if (activeOAuthFlow) {
            try { activeOAuthFlow.finish(new Error('superseded|בוצע ניסיון התחברות חדש')); } catch (e) { /* already settled */ }
            activeOAuthFlow = null;
        }
        let server = null;
        let settled = false;
        let listenRetries = 0;

        const finish = (err, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            activeOAuthFlow = null;
            if (server) {
                // Destroy keep-alive sockets first: server.close() alone leaves
                // the port bound until the browser's connection drains, which is
                // what produced "EADDRINUSE 127.0.0.1:8471" on reconnect.
                try { if (typeof server.closeAllConnections === 'function') server.closeAllConnections(); } catch (e) { /* older node */ }
                try { server.close(); } catch (e) { /* already closed */ }
                try { server.unref(); } catch (e) { /* keep default ref counting */ }
            }
            if (err) reject(err); else resolve(result);
        };
        activeOAuthFlow = { finish };

        const timeout = setTimeout(
            () => finish(new Error('timeout|לא הושלמה ההתחברות בדפדפן בזמן')),
            OAUTH_TIMEOUT_MS);

        try {
            server = http.createServer(handleRedirect);
        } catch (e) {
            finish(e);
            return;
        }

        server.on('error', (e) => {
            // A previous flow's socket can still be draining when the user
            // reconnects quickly; retry binding briefly before giving up.
            if (e && e.code === 'EADDRINUSE' && listenRetries < OAUTH_LISTEN_RETRIES) {
                listenRetries++;
                logToWindow('oauth', `הפורט ${OAUTH_REDIRECT_PORT} תפוס — ניסיון ${listenRetries}/${OAUTH_LISTEN_RETRIES} בעוד ${OAUTH_LISTEN_RETRY_MS}ms`);
                setTimeout(() => { if (!settled) listen(); }, OAUTH_LISTEN_RETRY_MS);
                return;
            }
            if (e && e.code === 'EADDRINUSE') {
                // Almost always a second copy of the app (which would also run a
                // second backup scheduler) holding the loopback port.
                finish(new Error(`port_in_use|הפורט ${OAUTH_REDIRECT_PORT} תפוס — ודאי שאין חלון אחר של האפליקציה פתוח, ואז נסי שוב`));
                return;
            }
            finish(e);
        });

        const listen = () => server.listen(OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
            // PKCE (RFC 7636): a high-entropy verifier plus its S256 challenge.
            const codeVerifier = crypto.randomBytes(64).toString('base64url');
            const codeChallenge = crypto.createHash('sha256')
                .update(codeVerifier).digest('base64url');

            const params = new URLSearchParams({
                client_id: oauthClientId(),
                redirect_uri: `http://127.0.0.1:${OAUTH_REDIRECT_PORT}`,
                response_type: 'code',
                scope: OAUTH_SCOPE,
                access_type: 'offline',
                include_granted_scopes: 'true',
                prompt: 'consent',
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });
            if (loginHint) params.set('login_hint', loginHint);
            shell.openExternal(`${OAUTH_AUTH_URL}?${params.toString()}`);
            logToWindow('oauth', 'נפתח חלון ההתחברות של גוגל בדפדפן...');
            logToWindow('oauth', `client ${oauthClientId().slice(0, 24)}… | secret: ${oauthClientSecret() ? 'set' : 'MISSING'} | scope: ${OAUTH_SCOPE}`);

            pendingCodeVerifier = codeVerifier;
        });
        listen();

        function handleRedirect(req, res) {
            if (settled) {
                res.end();
                return;
            }
            const reqUrl = new URL(req.url, `http://127.0.0.1:${OAUTH_REDIRECT_PORT}`);
            const code = reqUrl.searchParams.get('code');
            const error = reqUrl.searchParams.get('error');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            if (!code && !error) {
                // Stray browser request (favicon.ico, prefetch, etc.) - it is NOT
                // the OAuth redirect. Treating it as "no_code" used to abort a
                // flow whose real redirect had already succeeded.
                res.statusCode = 404;
                res.end();
                return;
            }
            if (error || !code) {
                const desc = reqUrl.searchParams.get('error_description') || '';
                res.end('<html dir="rtl"><body style="font-family:sans-serif"><h2>ההתחברות בוטלה.</h2><p>אפשר לחזור לאפליקציה.</p></body></html>');
                finish(new Error(`${error || 'no_code'}|${desc || 'לא התקבל קוד הרשאה מגוגל'}`));
                return;
            }
            res.end('<html dir="rtl"><body style="font-family:sans-serif"><h2>ההתחברות הצליחה!</h2><p>אפשר לחזור לאפליקציה ולסגור חלון זה.</p></body></html>');
            exchangeCodeForTokens(code, pendingCodeVerifier)
                .then((r) => finish(null, r))
                .catch((e) => finish(e));
        }
    });
}

// Holds the PKCE verifier for the in-flight authorization request.
let pendingCodeVerifier = null;

// --- Automatic backup scheduler (main-process anchor, re-ticked every 60s) ---
let backupPingTimer = null;

function startBackupPing() {
    if (backupPingTimer) clearInterval(backupPingTimer);
    backupPingTimer = setInterval(() => {
        try {
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0 && !wins[0].webContents.isDestroyed()) {
                wins[0].webContents.send('oauth-auto-backup-tick', Date.now());
            }
        } catch (e) { /* window closing */ }
    }, 60000);
}

// --- Daily automatic local backup file (spec: "גיבוי יומי אוטומטי לקובץ במחשב") ---
// One file per calendar day (overwritten on later calls the same day), kept
// separate from the manual "הורד קובץ גיבוי" download and from the Google
// Sheets auto-backup - this one lives entirely on the user's disk.
const LOCAL_BACKUP_KEEP_DAYS = 30;

function localBackupDir() {
    return path.join(app.getPath('userData'), 'backups');
}

function pruneOldLocalBackups(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        return; // directory does not exist yet - nothing to prune
    }
    const cutoff = Date.now() - LOCAL_BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
        if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
        const full = path.join(dir, file);
        try {
            const stat = fs.statSync(full);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
        } catch (e) { /* best-effort cleanup only */ }
    }
}

function writeLocalBackup(jsonString) {
    const dir = localBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const file = path.join(dir, `backup-${stamp}.json`);
    fs.writeFileSync(file, jsonString, 'utf8');
    pruneOldLocalBackups(dir);
    return { path: file, savedAt: new Date().toISOString() };
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: "לוח טהרת המשפחה",
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  
  // Open external links (http/https) in the default web browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Hide the default browser-like menu bar for a native app feel
  win.setMenuBarVisibility(false);
}

// --- Single-instance guard -------------------------------------------------
// Two copies of the app would fight over the OAuth loopback port
// (127.0.0.1:8471) and would each run a backup scheduler against the same
// Google account. A second launch now focuses the open window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.on('second-instance', () => {
  const [existing] = BrowserWindow.getAllWindows();
  if (!existing) return;
  if (existing.isMinimized()) existing.restore();
  existing.show();
  existing.focus();
});

if (!gotSingleInstanceLock) {
  app.quit();
} else app.whenReady().then(() => {
  // Current app version (from package.json via Electron), for the in-app
  // update checker (spec: בדיקה אוטומטית אם יש גרסה חדשה) to compare against
  // the latest GitHub release tag.
  ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
  });

  // Desktop OS notification (spec: התראות במחשב) - daily or event-day only,
  // decided by the renderer; this handler just shows whatever it is given.
  ipcMain.handle('show-notification', async (event, { title, body } = {}) => {
    if (!Notification.isSupported()) return { ok: false, error: 'not_supported' };
    new Notification({ title: title || 'לוח טהרת המשפחה', body: body || '' }).show();
    return { ok: true };
  });

  // Daily automatic local backup file
  ipcMain.handle('local-backup-write', async (event, jsonString) => {
    try {
      return { ok: true, ...writeLocalBackup(jsonString) };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });

  ipcMain.handle('local-backup-dir', async () => {
    return localBackupDir();
  });

  ipcMain.handle('local-backup-open-folder', async () => {
    const dir = localBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { ok: true };
  });

  // Attach Authorization header to Google API requests from the renderer
  session.defaultSession.webRequest.onBeforeSendHeaders(addAuthHeaderToRequests);

  // --- Google OAuth IPC ---
  ipcMain.handle('oauth-start', async (event, loginHint) => {
    try {
      return await startOAuthFlow(loginHint);
    } catch (e) {
      logToWindow('oauth', 'ההתחברות נכשלה: ' + (e.message || e));
      throw e;
    }
  });

  ipcMain.handle('oauth-status', async () => {
    const s = readStore();
    return {
      connected: !!s.refreshToken,
      email: s.email || '',
      spreadsheetId: s.spreadsheetId || '',
      sheetId: s.sheetId || '',
      lastBackupAt: s.lastBackupAt || '',
      calendarId: s.calendarId || '',
      calendarLastSyncAt: s.calendarLastSyncAt || '',
      grantedScopes: s.grantedScopes || ''
    };
  });

  // Renderer asks for a fresh token before making Google API calls;
  // the webRequest interceptor then attaches it automatically.
  ipcMain.handle('oauth-ensure-token', async () => {
    return ensureFreshToken();
  });

  ipcMain.handle('oauth-set-meta', async (event, patch) => {
    const next = writeStore(patch || {});
    return {
      connected: !!next.refreshToken,
      email: next.email || '',
      sheetId: next.sheetId || '',
      lastBackupAt: next.lastBackupAt || '',
      calendarId: next.calendarId || '',
      calendarLastSyncAt: next.calendarLastSyncAt || ''
    };
  });

  ipcMain.handle('oauth-disconnect', async () => {
    // Cancel an in-flight consent flow so it cannot re-connect after a
    // deliberate disconnect (this also frees its loopback server).
    if (activeOAuthFlow) {
      try { activeOAuthFlow.finish(new Error('superseded|החיבור נותק על-ידי המשתמש')); } catch (e) { /* already settled */ }
      activeOAuthFlow = null;
    }
    const s = readStore();
    // Best-effort revoke of the refresh token server-side
    if (s.refreshToken) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(s.refreshToken), { method: 'POST' });
      } catch (e) { /* offline revoke attempt is best-effort */ }
    }
    // calendarId is cleared too: disconnecting revokes the grant that lets the
    // app verify the calendar still exists (or still has the expected name).
    // The calendar itself is not deleted from the user's Google account - a
    // future reconnect re-discovers it by name (getOrCreateAppCalendar).
    writeStore({ token: '', refreshToken: '', email: '', expiry: 0, calendarId: '', calendarLastSyncAt: '' });
    logToWindow('oauth', 'החשבון נותק');
    return { ok: true };
  });

  ipcMain.handle('oauth-open-sheet', async () => {
    const s = readStore();
    if (s.sheetId) {
      shell.openExternal(`https://docs.google.com/spreadsheets/d/${s.sheetId}/edit`);
      return { ok: true };
    }
    return { ok: false };
  });

  createWindow();
  startBackupPing();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
