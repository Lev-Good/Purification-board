/**
 * בדיקות למודול סנכרון יומן גוגל (js/googleCalendar.js).
 *
 * Run with: node tests/googleCalendar.test.js
 *
 * מה נבדק:
 *  1. בניית רשימת האירועים הצפויים (buildExpectedEvents) - נקיים, טבילה,
 *     עונות פרישה, וההצעה (לא הכרעה הלכתית) לבדיקת הפסק טהרה.
 *  2. שלוש רמות הדיסקרטיות בכינוי האירוע.
 *  3. שדות ההתראה (reminders) לפי סוג האירוע, וסינון לפי ערוצים מבוקשים.
 *  4. שההחרגה לחלון הסנכרון (SYNC_HORIZON_DAYS) עובדת.
 *  5. **החרגת עונת פרישה שנעקרה** (`p.uprooted`) - היא נשארת ב-computed.prishot
 *     (מסומנת, לא מוסרת) כדי שהלוח יראה אותה, אבל לעולם לא צריכה להפוך
 *     לתזכורת אמיתית ביומן.
 *  6. אלגוריתם ה-Reconcile (יצירה / עדכון / מחיקה).
 *  7. hasCalendarScope - זיהוי הרשאת יומן חסרה בחיבור קיים.
 */
import { calculateEngine } from '../js/calculations.js';
import { HDate } from '../hebcal.js';
import { LOCATIONS } from '../js/zmanim.js';
import { buildExpectedEvents, reconcileEvents, hasCalendarScope, SYNC_HORIZON_DAYS } from '../js/googleCalendar.js';

let failures = 0;
function assert(condition, message) {
    if (condition) {
        console.log('PASS: ' + message);
    } else {
        failures++;
        console.error('FAIL: ' + message);
    }
}

/** "HH:MM" of a Date in a given IANA zone - environment-independent (doesn't
 * assume the test runner's own system timezone), matching js/zmanim.js's
 * own formatTime() approach. */
function hmInZone(date, tzid) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tzid, hour12: false }).format(date);
}
/** "YYYY-MM-DD" of a Date in a given IANA zone. */
function ymdInZone(date, tzid) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tzid }).format(date);
}

const jerusalem = LOCATIONS.find(l => l.id === 'jerusalem');
const baseSettings = {
    discretion: 'subtle', discreetPrefix: '', notifyEmail: true, notifyPopup: true,
    morningTime: '08:30', sunsetLeadMinutes: 120, hefsekAdvisoryDays: 5, mochDachukEnabled: false
};

// ---------- 1. נקיים + טבילה, מהפסק שנרשם ----------

const hefsekAbs = new HDate(5, 1, 5786).abs();
const nekiimDb = { [hefsekAbs]: { type: 'hefsek', ona: 'day' } };
const nekiimEngine = calculateEngine(nekiimDb, false, { today: hefsekAbs });
const nekiimEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, baseSettings);

assert(nekiimEvents.filter(e => e.eventType === 'check_morning').length === 7,
    'seven morning-check events, one per day of the seven clean days');
assert(nekiimEvents.filter(e => e.eventType === 'check_afternoon').length === 7,
    'seven afternoon-check events too');
assert(nekiimEvents.filter(e => e.eventType === 'tevilah').length === 1,
    'exactly one tevilah (mikvah-night) event');
assert(new Set(nekiimEvents.map(e => e.syncKey)).size === nekiimEvents.length,
    'every event has a unique syncKey - the reconcile engine matches on this alone');
assert(nekiimEvents.every(e => !isNaN(new Date(e.start.dateTime).getTime()) && !isNaN(new Date(e.end.dateTime).getTime())),
    'every event has valid start/end date-times');
assert(nekiimEvents.every(e => new Date(e.end.dateTime) > new Date(e.start.dateTime)),
    'every event ends after it starts');

// ---------- 2. רמות דיסקרטיות ----------

const detailed = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, { ...baseSettings, discretion: 'detailed' })
    .find(e => e.eventType === 'check_morning');
assert(detailed.summary.indexOf('שחרית') !== -1 && detailed.summary.indexOf('לשבעה נקיים') !== -1,
    'the "detailed" level names the check and the seven-clean-days context');

const subtle = nekiimEvents.find(e => e.eventType === 'check_morning');
assert(subtle.summary === 'בדיקה - בוקר', 'the "subtle" level uses the generic label, no context');

const discreetSettings = { ...baseSettings, discretion: 'discreet', discreetPrefix: '' };
const discreetEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, discreetSettings);
assert(discreetEvents.every(e => /^תזכורת \d+$/.test(e.summary)),
    'the "discreet" level never leaks the real subject into the title - only a running number');
assert(new Set(discreetEvents.map(e => e.summary)).size === discreetEvents.length,
    'discreet numbering is unique within one sync batch');

const customPrefixEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs,
    { ...baseSettings, discretion: 'discreet', discreetPrefix: 'פגישה' });
assert(customPrefixEvents[0].summary.indexOf('פגישה') === 0,
    'a custom discreet prefix (e.g. "פגישה") is honored');

// ---------- 3. תזכורות: תוכן וסינון ערוצים ----------

const morningEvent = nekiimEvents.find(e => e.eventType === 'check_morning');
assert(morningEvent.reminders.overrides.some(o => o.method === 'email') &&
    morningEvent.reminders.overrides.some(o => o.method === 'popup'),
    'the morning check requests both an email and a popup reminder by default');

const emailOnlySettings = { ...baseSettings, notifyPopup: false };
const emailOnlyEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, emailOnlySettings);
assert(emailOnlyEvents.every(e => !e.reminders.overrides.some(o => o.method === 'popup')),
    'turning off the popup channel removes it from every single event, no exceptions');
assert(emailOnlyEvents.some(e => e.reminders.overrides.some(o => o.method === 'email')),
    'the email channel is untouched when only popup was turned off');

const noneSettings = { ...baseSettings, notifyEmail: false, notifyPopup: false };
const noneEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, noneSettings);
assert(noneEvents.every(e => e.reminders.overrides.length === 0),
    'turning off both channels leaves every event with no reminder overrides at all');

// ---------- 3b. זמן תזכורת דוא"ל לפני השקיעה (settings.sunsetLeadMinutes, spec §8.5) ----------

const afternoonEvent = nekiimEvents.find(e => e.eventType === 'check_afternoon');
assert(afternoonEvent.reminders.overrides.find(o => o.method === 'email').minutes === 120,
    'the afternoon-check email reminder uses the configured sunset lead time (default 120)');

const shortLeadEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs,
    { ...baseSettings, sunsetLeadMinutes: 30 });
const shortLeadAfternoon = shortLeadEvents.find(e => e.eventType === 'check_afternoon');
assert(shortLeadAfternoon.reminders.overrides.find(o => o.method === 'email').minutes === 30,
    'changing sunsetLeadMinutes changes the afternoon-check email lead time accordingly');
assert(shortLeadAfternoon.reminders.overrides.find(o => o.method === 'popup').minutes === 45,
    'the popup lead time is a separate, fixed value - unaffected by the email setting');

// hefsek_advisory only fires "today", when there is bleeding with no hefsek recorded since.
const advisoryToday = hefsekAbs - 10;
const advisoryDb = { [advisoryToday - 6]: { type: 'reiyah', ona: 'day' } };
const advisoryEngine = calculateEngine(advisoryDb, false, { today: advisoryToday });
const advisoryEvents = buildExpectedEvents(advisoryDb, advisoryEngine, jerusalem, advisoryToday,
    { ...baseSettings, sunsetLeadMinutes: 60 });
const advisoryEvent = advisoryEvents.find(e => e.eventType === 'hefsek_advisory');
assert(advisoryEvent && advisoryEvent.reminders.overrides.find(o => o.method === 'email').minutes === 60,
    'the hefsek-advisory email reminder also honors the configured sunset lead time');

// ---------- 3c. תזכורות "בוקר/ערב" בשעה קבועה (pushHeadsUp) ----------
// Google Calendar reminders are always relative to the event's OWN start -
// so "email in the morning" / "email at 20:00 the evening before" (spec §4,
// for tevilah/prisha-day/prisha-night) can only be honored with a genuinely
// separate, fixed-clock-time ping event; the main event keeps only its
// (already-correct) popup override.

const tevilahEvent = nekiimEvents.find(e => e.eventType === 'tevilah');
const tevilahHeadsUp = nekiimEvents.find(e => e.eventType === 'tevilah_headsup');
assert(!tevilahEvent.reminders.overrides.some(o => o.method === 'email'),
    'the main tevilah event no longer carries an approximated "at tzeit" email override');
assert(tevilahEvent.reminders.overrides.some(o => o.method === 'popup' && o.minutes === 60),
    'the main tevilah event keeps its popup override - that offset was already correct (relative to the event itself)');
assert(!!tevilahHeadsUp, 'a separate tevilah_headsup event is created');
assert(tevilahHeadsUp.dateAbs === tevilahEvent.dateAbs,
    'the heads-up shares the same dateAbs as the tevilah event it announces');
assert(hmInZone(new Date(tevilahHeadsUp.start.dateTime), jerusalem.tzid) === '08:30',
    'the heads-up fires at the configured morning time (08:30), not at tzeit');
assert(ymdInZone(new Date(tevilahHeadsUp.start.dateTime), jerusalem.tzid)
    === ymdInZone(new Date(tevilahEvent.start.dateTime), jerusalem.tzid),
    'and lands on the SAME calendar day as the tevilah night itself (the morning before it), not the day after');
assert(tevilahHeadsUp.reminders.overrides.length === 1 && tevilahHeadsUp.reminders.overrides[0].method === 'email',
    'the heads-up carries only an email reminder, fired immediately (it IS the reminder)');

// Turning email off skips the heads-up entirely (it exists only to carry one) -
// but the main events (with only a popup override) are unaffected.
const noEmailEvents = buildExpectedEvents(nekiimDb, nekiimEngine, jerusalem, hefsekAbs, { ...baseSettings, notifyEmail: false });
assert(!noEmailEvents.some(e => e.eventType === 'tevilah_headsup'),
    'with email notifications off, no heads-up event is created at all - it would carry nothing');
assert(noEmailEvents.some(e => e.eventType === 'tevilah'),
    'the main tevilah event still exists (it still carries the popup reminder)');

// The prisha_day/prisha_night heads-up pair is checked in section 5 below,
// once `liveEvents` (a still-live separation concern) exists to test against.

// ---------- 4. חלון הסנכרון (SYNC_HORIZON_DAYS) ----------

const todayAbs = new HDate(1, 1, 5786).abs();
const farVeset = { [todayAbs]: { type: 'reiyah', ona: 'day' } };
// A concern projected far beyond the sync horizon must never turn into an event.
const farEngine = calculateEngine(farVeset, false, { today: todayAbs });
const nearHorizonAbs = todayAbs + SYNC_HORIZON_DAYS + 10;
const withinAndBeyond = buildExpectedEvents(farVeset, farEngine, jerusalem, todayAbs, baseSettings);
assert(withinAndBeyond.every(e => e.dateAbs <= todayAbs + SYNC_HORIZON_DAYS),
    'no event is ever built for a date beyond SYNC_HORIZON_DAYS, however far the engine itself projects');
assert(withinAndBeyond.every(e => e.dateAbs >= todayAbs),
    'no event is ever built for a date before today');

// ---------- 5. עונת פרישה שנעקרה - אינה הופכת לתזכורת ----------

const singleSightingAbs = new HDate(5, 1, 5786).abs();
const irregularDb = { [singleSightingAbs]: { type: 'reiyah', ona: 'day' } };

// Right when the concern is still live (the due day itself), it must produce
// an event - this is the control case, proving the filter below is real.
const liveEngine = calculateEngine(irregularDb, false, { today: singleSightingAbs + 29 });
const liveEvents = buildExpectedEvents(irregularDb, liveEngine, jerusalem, singleSightingAbs + 29, baseSettings);
assert(liveEvents.some(e => e.eventType === 'prisha_day' || e.eventType === 'prisha_night'),
    'a still-live, non-fixed separation concern DOES produce a calendar event (control case)');

// The email side of prisha_day/prisha_night is a fixed-clock-time heads-up
// (§4: "20:00 the evening before" / "in the morning"), not a sunrise/sunset-
// relative approximation - see the pushHeadsUp block in section 3c above.
const dayHeadsUp = liveEvents.find(e => e.eventType === 'prisha_day_headsup');
const nightHeadsUp = liveEvents.find(e => e.eventType === 'prisha_night_headsup');
assert(!!dayHeadsUp || !!nightHeadsUp, 'setup check: the control-case sighting produced at least one prisha heads-up');
if (dayHeadsUp) {
    const dayMain = liveEvents.find(e => e.eventType === 'prisha_day' && e.dateAbs === dayHeadsUp.dateAbs);
    assert(!dayMain.reminders.overrides.some(o => o.method === 'email'),
        'the main prisha_day event no longer carries the ~20:00 approximated email override');
    assert(hmInZone(new Date(dayHeadsUp.start.dateTime), jerusalem.tzid) === '20:00',
        'the prisha_day heads-up fires at exactly 20:00 (spec §4), not a sunrise-relative approximation');
    assert(new Date(dayHeadsUp.start.dateTime).getTime() < new Date(dayMain.start.dateTime).getTime(),
        'and it falls the evening BEFORE the separation day itself');
}
if (nightHeadsUp) {
    const nightMain = liveEvents.find(e => e.eventType === 'prisha_night' && e.dateAbs === nightHeadsUp.dateAbs);
    assert(!nightMain.reminders.overrides.some(o => o.method === 'email'),
        'the main prisha_night event no longer carries the "at sunset" approximated email override');
    assert(hmInZone(new Date(nightHeadsUp.start.dateTime), jerusalem.tzid) === '08:30',
        'the prisha_night heads-up fires at the configured morning time');
}

// Advance far past it with no sighting recorded there - it becomes uprooted
// (js/calculations.js mutates it in place with p.uprooted = true, but keeps
// it in computed.prishot so the calendar GRID can still show it happened).
const farAbs = new HDate(20, 2, 5786).abs();
const uprootedEngine = calculateEngine(irregularDb, false, { today: farAbs });
const uprootedAny = Object.values(uprootedEngine.computed.prishot).some(list => list.some(p => p.uprooted));
assert(uprootedAny, 'setup check: the far-future engine run actually produced an uprooted concern to test against');

const uprootedEvents = buildExpectedEvents(irregularDb, uprootedEngine, jerusalem, farAbs, baseSettings);
const uprootedAbsDays = Object.keys(uprootedEngine.computed.prishot)
    .map(Number)
    .filter(abs => uprootedEngine.computed.prishot[abs].some(p => p.uprooted));
assert(!uprootedEvents.some(e => uprootedAbsDays.includes(e.dateAbs) && (e.eventType === 'prisha_day' || e.eventType === 'prisha_night')),
    'an uprooted separation concern never becomes a calendar reminder, even though it still sits in computed.prishot');
assert(!uprootedEvents.some(e => uprootedAbsDays.includes(e.dateAbs) && (e.eventType === 'prisha_day_headsup' || e.eventType === 'prisha_night_headsup')),
    'nor does it spawn a morning/evening heads-up event - same exclusion applies to both halves of the pair');

// ---------- 6. Reconcile: יצירה / עדכון / מחיקה ----------

const expected = [
    { syncKey: 'a', start: { dateTime: '2026-01-01T10:00:00.000Z' }, end: { dateTime: '2026-01-01T11:00:00.000Z' } },
    { syncKey: 'b', start: { dateTime: '2026-01-02T10:00:00.000Z' }, end: { dateTime: '2026-01-02T11:00:00.000Z' } },
    { syncKey: 'c', start: { dateTime: '2026-01-03T09:00:00.000Z' }, end: { dateTime: '2026-01-03T10:00:00.000Z' } }
];
const existing = [
    { id: 'g1', syncKey: 'a', startDateTime: '2026-01-01T10:00:00.000Z', endDateTime: '2026-01-01T11:00:00.000Z' }, // unchanged
    { id: 'g2', syncKey: 'c', startDateTime: '2026-01-03T10:00:00.000Z', endDateTime: '2026-01-03T11:00:00.000Z' }, // time changed -> update
    { id: 'g3', syncKey: 'd', startDateTime: '2026-01-04T10:00:00.000Z', endDateTime: '2026-01-04T11:00:00.000Z' }  // no longer expected -> delete
];
const diff = reconcileEvents(expected, existing);

assert(diff.toCreate.length === 1 && diff.toCreate[0].syncKey === 'b',
    'an expected event missing from the calendar is queued for creation');
assert(diff.toUpdate.length === 1 && diff.toUpdate[0].id === 'g2',
    'an event whose time changed is queued for update, matched by its Google id');
assert(diff.toDelete.length === 1 && diff.toDelete[0] === 'g3',
    'an event no longer in the expected list is queued for deletion');
assert(!diff.toCreate.some(e => e.syncKey === 'a') && !diff.toUpdate.some(u => u.event.syncKey === 'a'),
    'an unchanged event is left alone entirely - no needless API write');

// ---------- 7. hasCalendarScope ----------

assert(hasCalendarScope({ grantedScopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar' }) === true,
    'a status carrying the calendar scope is recognized');
assert(hasCalendarScope({ grantedScopes: 'https://www.googleapis.com/auth/drive.file' }) === false,
    'a Sheets-only connection (made before this feature shipped) is correctly NOT recognized as calendar-scoped');
assert(hasCalendarScope({}) === false, 'a missing grantedScopes field never crashes and reads as false');
assert(hasCalendarScope(null) === false, 'a missing status object never crashes and reads as false');

if (failures > 0) {
    console.error(`\n${failures} googleCalendar test(s) failed.`);
    process.exitCode = 1;
} else {
    console.log('\nAll googleCalendar tests passed.');
}
