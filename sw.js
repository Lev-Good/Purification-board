/**
 * Service Worker — app-shell offline cache for the web/PWA build.
 *
 * This is what actually backs the installability promise of the manifest that
 * js/app.js injects (`display: 'standalone'`, home-screen icon): without a
 * service worker, an "installed" copy still fails to load with no network,
 * even though nothing in this app's own logic needs a network connection.
 *
 * Not loaded by the Electron build at all (main.js never registers it, and it
 * only runs where js/app.js's registration succeeds — see the guard there).
 *
 * Bump CACHE_NAME on every deploy that changes any precached file, so old
 * clients pick up the new version instead of being stuck on a stale cache.
 */
const CACHE_NAME = 'taharah-shell-v1';

const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './hebcal.js',
    './icon.png',
    './js/akira.js',
    './js/app.js',
    './js/calculations.js',
    './js/chazaka.js',
    './js/dayMarks.js',
    './js/googleBackup.js',
    './js/halachaHelp.js',
    './js/icons.js',
    './js/lifeState.js',
    './js/notifications.js',
    './js/pillPause.js',
    './js/reiyaDuration.js',
    './js/security.js',
    './js/silekReturn.js',
    './js/storage.js',
    './js/stringencies.js',
    './js/ui.js',
    './js/vesetDilug.js',
    './js/vesetGuf.js',
    './js/zmanim.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    // רק בקשות GET מאותו מקור — לא Google Fonts, FormSubmit או Google Sheets
    // (חוצי-מקור), ולא POST/OPTIONS של שליחת המייל/הגיבוי.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    // ניווט (טעינת index.html): קודם רשת, כדי שגרסה מעודכנת תגיע כשיש חיבור,
    // ורק בהיעדר רשת ליפול לעותק השמור.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // שאר קבצי המעטפת (css/js/תמונה): קודם מהמטמון (מהיר, ועובד בלי רשת),
    // וברקע מתעדכן מהרשת לפעם הבאה.
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((response) => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
