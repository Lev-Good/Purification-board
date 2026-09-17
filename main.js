const { app, BrowserWindow, ipcMain, shell, net, session, Notification, Menu, MenuItem } = require('electron');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');

// Derive a stable key for local PIN protection
const ENCRYPTION_KEY = crypto.scryptSync('taharah-local-secure-key-9823', 'taharah-salt', 32);
const IV_LENGTH = 16;

// --- OAuth loopback constants ---
// Shipping model: the app carries its own OAuth credentials, so a user only
// ever presses "connect" - no Google Cloud project and no setup screen.
// Both values live in the bundled `main.js` (the only file in build.files that
// can hold them). A developer who wants to test with a different client can
// point at one with the git-ignored file next to the app, which is NOT packaged:
//   google-oauth.local.json  ->  { "clientId": "...", "clientSecret": "..." }
const OAUTH_DEFAULT_CLIENT_ID = '91504498892-d5giddrbe9as3me1neqta1j5lc9cp0gr.apps.googleusercontent.com';

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
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
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
    if (details.url.startsWith('https://sheets.googleapis.com/') || details.url.startsWith('https://www.googleapis.com/upload/drive/v3/files'))
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

function readStore() {
    try {
        return JSON.parse(fs.readFileSync(STORE_PATH(), 'utf8'));
    } catch (e) {
        return {};
    }
}

function writeStore(patch) {
    const next = Object.assign({}, readStore(), patch);
    try {
        fs.mkdirSync(path.dirname(STORE_PATH()), { recursive: true });
        fs.writeFileSync(STORE_PATH(), JSON.stringify(next, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to persist OAuth store:', e);
    }
    return next;
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

    const next = writeStore({
        token: data.access_token,
        refreshToken: data.refresh_token,
        expiry: Date.now() + (data.expires_in || 3600) * 1000,
        email,
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

function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error("Local encryption failed:", err);
    return text;
  }
}

function decrypt(text) {
  try {
    const textParts = text.split(':');
    if (textParts.length < 2) return text; // Fallback for plaintext or legacy formats
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Local decryption failed:", err);
    return text;
  }
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
  // IPC handle for local encryption
  ipcMain.handle('encrypt-string', async (event, plainText) => {
    return encrypt(plainText);
  });

  // IPC handle for local decryption
  ipcMain.handle('decrypt-string', async (event, base64Cipher) => {
    return decrypt(base64Cipher);
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
      lastBackupAt: s.lastBackupAt || ''
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
      lastBackupAt: next.lastBackupAt || ''
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
    writeStore({ token: '', refreshToken: '', email: '', expiry: 0 });
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
