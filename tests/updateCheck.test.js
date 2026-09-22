/**
 * בדיקות להשוואת גרסאות (`js/updateCheck.js`, בדיקת עדכון מגיטהאב).
 *
 * Run with: node tests/updateCheck.test.js
 *
 * לא נבדקת כאן קריאת הרשת (`fetchLatestRelease`) — היא תלויה ב-GitHub החי;
 * הלוגיקה הדטרמיניסטית היחידה כאן היא השוואת הגרסאות, וזו הנבדקת.
 */
import { compareVersions } from '../js/updateCheck.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

assert(compareVersions('2.1.0', '2.0.0') === 1, 'a newer minor version compares greater');
assert(compareVersions('2.0.0', '2.1.0') === -1, 'an older minor version compares smaller');
assert(compareVersions('2.0.0', '2.0.0') === 0, 'identical versions compare equal');
assert(compareVersions('v2.0.1', '2.0.0') === 1, 'a leading "v" tag is stripped before comparing');
assert(compareVersions('2.0', '2.0.0') === 0, 'a missing patch segment defaults to 0');
assert(compareVersions('3.0.0', '2.9.9') === 1, 'a major bump outranks any minor/patch difference');
assert(compareVersions('2.10.0', '2.9.0') === 1, 'numeric segments compare as numbers, not as text ("10" > "9")');
assert(compareVersions('', '1.0.0') === -1, 'a missing/empty version is treated as 0.0.0');

if (failures > 0) {
    console.error(`\n${failures} updateCheck test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll updateCheck tests passed.');
}
