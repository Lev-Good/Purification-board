/**
 * בדיקות ליומן התקלות האוטומטי (`js/errorLog.js`) - רישום, ספירה, ניקוי,
 * ותוכן קובץ הייצוא (פרטי מערכת + כל הרשומות).
 *
 * Run with: node tests/errorLog.test.js
 *
 * ה-handlers הגלובליים (window.addEventListener('error'/'unhandledrejection'))
 * לא נבדקים כאן במפורש - הם רק עטיפה דקה סביב logError, וזו הנבדקת ישירות.
 */

const store = {};
global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};

let lastDownloadHref = '';
global.document = {
    createElement: () => ({
        setAttribute(name, value) { if (name === 'href') lastDownloadHref = value; },
        click() {}
    })
};

const listeners = {};
global.window = {
    innerWidth: 1024,
    innerHeight: 768,
    screen: { width: 1920, height: 1080 },
    addEventListener: (type, cb) => { listeners[type] = cb; }
};
Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'test-agent', platform: 'test-platform', language: 'he-IL', onLine: true },
    configurable: true
});

const errorLog = await import('../js/errorLog.js');

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

// Starts empty.
assert(errorLog.getErrorLogCount() === 0, 'the log starts empty with no entries recorded yet');

// Recording grows the count and survives a re-read.
errorLog.logError('שגיאת בדיקה ראשונה', 'stack-1');
assert(errorLog.getErrorLogCount() === 1, 'logError() adds exactly one entry');
errorLog.logError('שגיאת בדיקה שנייה');
assert(errorLog.getErrorLogCount() === 2, 'a second call adds a second entry rather than overwriting the first');

// logError must never throw, even with unusual input.
let threw = false;
try {
    errorLog.logError(null, undefined);
    errorLog.logError({ toString() { throw new Error('boom'); } });
} catch (e) {
    threw = true;
}
assert(!threw, 'logError() never throws, even on null/undefined or a value whose toString() throws');

// The exported file includes both the system info header and the entries.
errorLog.downloadErrorLog();
assert(lastDownloadHref.startsWith('data:text/plain;charset=utf-8,'), 'the exported log is a downloadable text file');
const decoded = decodeURIComponent(lastDownloadHref.slice('data:text/plain;charset=utf-8,'.length));
assert(decoded.includes('test-agent'), 'the exported file carries the User-Agent for diagnosing the device');
assert(decoded.includes('שגיאת בדיקה ראשונה'), 'the exported file carries a previously logged entry');
assert(decoded.includes('stack-1'), 'the exported file carries the stack/extra detail attached to an entry');

// Clearing empties the log again.
errorLog.clearErrorLog();
assert(errorLog.getErrorLogCount() === 0, 'clearErrorLog() empties the log');

// A ring buffer: recording well past the cap keeps only the most recent entries.
for (let i = 0; i < 250; i++) errorLog.logError('bulk-' + i);
assert(errorLog.getErrorLogCount() === 200, 'the log is capped at 200 entries (a ring buffer, not unbounded growth)');

// initErrorLogging wires up both global handlers without throwing.
let initThrew = false;
try {
    errorLog.initErrorLogging();
} catch (e) {
    initThrew = true;
}
assert(!initThrew, 'initErrorLogging() runs without throwing');
assert(typeof listeners.error === 'function', 'initErrorLogging() registers a window "error" listener');
assert(typeof listeners.unhandledrejection === 'function', 'initErrorLogging() registers a window "unhandledrejection" listener');

errorLog.clearErrorLog();
listeners.error({ message: 'oops', filename: 'app.js', lineno: 1, colno: 2 });
assert(errorLog.getErrorLogCount() === 1, 'a real "error" event is recorded into the log');

listeners.unhandledrejection({ reason: new Error('rejected') });
assert(errorLog.getErrorLogCount() === 2, 'a real "unhandledrejection" event is recorded into the log');

if (failures > 0) {
    console.error(`\n${failures} errorLog test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll errorLog tests passed.');
}
