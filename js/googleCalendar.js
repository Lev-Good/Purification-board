import { HDate, Zmanim } from '../hebcal.js';
import { dayTimesRaw } from './zmanim.js';

/**
 * Google Calendar sync + email/popup reminders (docs/GOOGLE_CALENDAR_SPEC.md).
 *
 * Architecture (mirrors js/googleBackup.js exactly - same OAuth grant, same
 * "renderer calls fetch, main process attaches the Authorization header"
 * pattern, same 'Bearer PLACEHOLDER' convention):
 *
 *  - The app's reminders live in a SEPARATE, app-created calendar (never the
 *    user's primary calendar) - see §2 of the spec: a user can hide it with
 *    one click, and disconnecting/resetting can delete it wholesale.
 *  - Every event the app creates carries `extendedProperties.private.app =
 *    'taharah-board'` and a stable `syncKey` derived from its type + date.
 *    That is the ONLY way the app recognizes "this is mine" on a later sync -
 *    it never touches an event it did not tag itself, even in its own
 *    calendar.
 *  - `buildExpectedEvents` is a PURE function: given the current database,
 *    settings and the already-computed engine output, it returns the full
 *    list of events that SHOULD exist over a short future window. It knows
 *    nothing about the network.
 *  - `reconcileEvents` is also PURE: given that expected list and whatever
 *    the calendar actually has (fetched separately), it decides what to
 *    create, update or delete. The actual POST/PATCH/DELETE calls are a thin
 *    I/O layer on top, so the interesting logic stays unit-testable.
 */

// ---------- Constants ----------

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/';
const APP_TAG = 'taharah-board';
export const CALENDAR_SUMMARY = 'לוח טהרה - תזכורות אישיות';

// How far into the future to keep the calendar synced. computed.prishot can
// project up to CHAZAKA_HORIZON_DAYS (730 - two Hebrew years) for a fixed
// veset, but creating that many calendar events at once would both hammer
// the API and clutter the user's calendar with reminders for a year she
// hasn't lived through yet. A short rolling window, re-synced regularly
// (the same "on save" / "on open" / "manual" triggers as the spec's §6ב),
// keeps the calendar accurate without ever needing to hold that much state.
export const SYNC_HORIZON_DAYS = 60;

// Standard depression angle for tzeit hakochavim, matching common practice
// (Zmanim.tzeit()'s own default) - used for מוך דחוק's end time and for
// leil טבילה's start time, neither of which sunset() alone can express.
const TZEIT_ANGLE = 8.5;

/**
 * Discretion levels (spec §2ב). "subtle" is the default - the other two are
 * an explicit, deliberate opt-in from a privacy-conscious user, never a
 * silent choice the app makes for her.
 */
export const DISCRETION_LEVELS = ['detailed', 'subtle', 'discreet'];

function hasApi() {
    return typeof window !== 'undefined' && window.api && window.api.oauthStatus;
}

// ---------- Time helpers ----------

/**
 * Adds/subtracts whole minutes from a Date, returning a new Date.
 */
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

/**
 * tzeit hakochavim for the Gregorian calendar day belonging to `abs` - i.e.
 * the evening AFTER that Hebrew day's daytime, matching how `dayTimesRaw`
 * already anchors `day.sunset`.
 */
function tzeitFor(abs, location) {
    let greg;
    try {
        greg = new HDate(abs).greg();
    } catch (e) {
        return null;
    }
    try {
        return new Zmanim(greg, location.lat, location.long).tzeit(TZEIT_ANGLE);
    } catch (e) {
        return null;
    }
}

function toIso(date, tzid) {
    return { dateTime: date.toISOString(), timeZone: tzid || 'Asia/Jerusalem' };
}

/**
 * "HH:MM" wall-clock time on the Gregorian day of `abs`, in the location's
 * own timezone - for the fixed morning-check time, which is a clock time
 * the user chose, not a זמן derived from the sun.
 */
function clockTimeFor(abs, hhmm, location) {
    let greg;
    try {
        greg = new HDate(abs).greg();
    } catch (e) {
        return null;
    }
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    // Built from the location's local wall-clock date, not UTC, so the event
    // lands on the intended civil day regardless of the machine's own timezone.
    const local = new Date(greg.getFullYear(), greg.getMonth(), greg.getDate(), h, m, 0);
    return local;
}

// ---------- Discretion-level labels ----------

const LABELS = {
    hefsek_advisory: { detailed: 'הפסק טהרה — כדאי לבדוק', subtle: 'תזכורת בדיקה' },
    moch: { detailed: 'מוך דחוק', subtle: 'תזכורת בדיקה' },
    check_morning: { detailed: (n) => `בדיקת שחרית — יום ${n} לשבעה נקיים`, subtle: 'בדיקה - בוקר' },
    check_afternoon: { detailed: (n) => `בדיקת מנחה — יום ${n} לשבעה נקיים`, subtle: 'בדיקה - מנחה' },
    tevilah: { detailed: 'טבילה (ליל מקווה)', subtle: 'טבילה' },
    prisha_day: { detailed: (code) => `עונת פרישה (יום) — ${code}`, subtle: 'עונת פרישה (יום)' },
    prisha_night: { detailed: (code) => `עונת פרישה (לילה) — ${code}`, subtle: 'עונת פרישה (לילה)' }
};

/**
 * Builds the visible event title for one expected event, per the chosen
 * discretion level (spec §2ב). At the "discreet" level the real subject
 * never appears in the title at all - only a running, arbitrary label the
 * settings screen lets her rename to anything she wants (e.g. "פגישה 1").
 * `index` is this event's position within the current sync batch, purely
 * cosmetic (it does not need to be stable across syncs - only `syncKey`,
 * used for matching, does).
 */
function buildSummary(eventType, ctx, settings, index) {
    if (settings.discretion === 'discreet') {
        const prefix = settings.discreetPrefix || 'תזכורת';
        return `${prefix} ${index + 1}`;
    }
    const def = LABELS[eventType];
    if (!def) return eventType;
    const useDetailed = settings.discretion === 'detailed';
    const value = useDetailed ? def.detailed : def.subtle;
    return typeof value === 'function' ? value(ctx) : value;
}

// ---------- Reminders per event type (spec §4) ----------

/**
 * Returns `{method, minutes}` overrides for one event, filtered by which
 * channels the user actually wants (spec §8, "ערוצי התראה מבוקשים").
 * `minutesBeforeStart` is relative to the event's OWN start time, matching
 * how Google Calendar reminders always work - the spec's "שעתיים לפני
 * השקיעה" etc. is really "N minutes before this event begins", because the
 * events below are themselves built to start at that offset from sunset.
 */
function remindersFor(overrides, settings) {
    const list = [];
    overrides.forEach(o => {
        if (o.method === 'email' && !settings.notifyEmail) return;
        if (o.method === 'popup' && !settings.notifyPopup) return;
        list.push(o);
    });
    return { useDefault: false, overrides: list };
}

// ---------- Pure event-list builder ----------

/**
 * Derives the full list of events that SHOULD exist in the app's calendar
 * for the next `SYNC_HORIZON_DAYS`, from the app's own already-computed
 * state - never by re-deriving halacha itself (that stays calculations.js's
 * job). Pure and synchronous: no network, no Date.now() side effects beyond
 * what `todayAbs` already fixes for the caller.
 *
 * @param {Object} db - the events database (js/storage.js getDb())
 * @param {Object} engineResult - calculateEngine(db, ...)'s return value
 * @param {Object} location - a js/zmanim.js LOCATIONS entry (lat/long/tzid)
 * @param {number} todayAbs - the reference "today" (halachicTodayAbs)
 * @param {Object} settings - {discretion, discreetPrefix, notifyEmail,
 *   notifyPopup, morningTime, sunsetLeadMinutes, hefsekAdvisoryDays, mochDachukEnabled}
 * @returns {Array<{syncKey, dateAbs, ona, summary, description, start, end, reminders}>}
 */
export function buildExpectedEvents(db, engineResult, location, todayAbs, settings) {
    if (!location) return []; // no location - no sunrise/sunset, nothing to schedule
    const events = [];
    const horizonEnd = todayAbs + SYNC_HORIZON_DAYS;
    const computed = (engineResult && engineResult.computed) || {};
    let index = 0;

    function push(eventType, ctx, dateAbs, ona, start, end, reminderOverrides, description) {
        if (!start || !end) return; // no sunrise/sunset that day (extreme latitude) - skip, never guess
        events.push({
            syncKey: `${eventType}_${dateAbs}_${ona || 'x'}`,
            eventType,
            dateAbs,
            ona: ona || null,
            summary: buildSummary(eventType, ctx, settings, index++),
            description: description || '',
            start: toIso(start, location.tzid),
            end: toIso(end, location.tzid),
            reminders: remindersFor(reminderOverrides, settings)
        });
    }

    // --- שבעה נקיים: בדיקת שחרית ומנחה, ימים 1–7 (computed.nekiim) ---
    (computed.nekiim || []).forEach(abs => {
        if (abs < todayAbs || abs > horizonEnd) return;
        const dayNum = (computed.nekiimStart || []).length
            ? abs - (computed.nekiimStart.find(s => s <= abs) ?? abs) + 1
            : null;
        const raw = dayTimesRaw(abs, location);
        if (!raw) return;

        const morning = clockTimeFor(abs, settings.morningTime, location);
        push('check_morning', dayNum, abs, 'day',
            morning, morning ? addMinutes(morning, 30) : null,
            [{ method: 'email', minutes: 0 }, { method: 'popup', minutes: 0 }],
            'תזכורת בדיקת שבעה נקיים\nהופק ע"י לוח טהרה');

        const afternoonStart = addMinutes(raw.day.sunset, -60);
        push('check_afternoon', dayNum, abs, 'day',
            afternoonStart, raw.day.sunset,
            [{ method: 'email', minutes: 120 }, { method: 'popup', minutes: 45 }],
            'תזכורת בדיקת שבעה נקיים\nהופק ע"י לוח טהרה');
    });

    // --- טבילה (ליל מקווה): computed.tevilot - צאת הכוכבים ומשך שעתיים ---
    (computed.tevilot || []).forEach(abs => {
        if (abs < todayAbs || abs > horizonEnd) return;
        const tzeit = tzeitFor(abs, location);
        if (!tzeit) return;
        push('tevilah', null, abs, 'night',
            tzeit, addMinutes(tzeit, 120),
            [{ method: 'email', minutes: 0 }, { method: 'popup', minutes: 60 }],
            'תזכורת טבילה\nהופק ע"י לוח טהרה');
    });

    // --- עונות פרישה: computed.prishot, מסוננות לימים העתידיים בטווח בלבד ---
    Object.keys(computed.prishot || {}).forEach(key => {
        const abs = Number(key);
        if (abs < todayAbs || abs > horizonEnd) return;
        const raw = dayTimesRaw(abs, location);
        if (!raw) return;
        (computed.prishot[abs] || []).forEach(p => {
            // An uprooted concern stays in computed.prishot (mutated in place
            // with `p.uprooted = true`, not removed) so the calendar GRID can
            // still show that something once stood there. A calendar EVENT
            // must never be created for it - the concern no longer applies.
            if (p.uprooted) return;
            if (p.ona === 'day') {
                push('prisha_day', p.code, abs, 'day',
                    raw.day.sunrise, raw.day.sunset,
                    [{ method: 'email', minutes: 720 }, { method: 'popup', minutes: 0 }], // ~20:00 the evening before
                    `עונת פרישה — ${p.reason}\nהופק ע"י לוח טהרה`);
            } else {
                push('prisha_night', p.code, abs, 'night',
                    raw.night.sunset, raw.night.sunrise,
                    [{ method: 'email', minutes: 0 }, { method: 'popup', minutes: 30 }],
                    `עונת פרישה — ${p.reason}\nהופק ע"י לוח טהרה`);
            }
        });
    });

    // --- הפסק טהרה / מוך דחוק: מסך "נקיים צפוי" (יעוץ בלבד, לא הכרעה הלכתית) ---
    // אין באפליקציה מנגנון שמחשב "יום הפסק מתוכן" מראש (בשונה מנקיים/וסתות,
    // שנגזרים מבדיקה בפועל או מחזקה שנקבעה) - הפסק הוא בחירת המשתמשת. זו
    // תזכורת-הצעה בלבד: אם עברו X ימים (הגדרה, ברירת מחדל 5) מהראייה/המשך-
    // הדימום האחרון בלי שנרשם הפסק מאז, מוצג "כדאי לבדוק" עבור **היום בלבד**
    // (חוזר בכל יום כזה, לא מיום קבוע מראש), עד שנרשם הפסק.
    const hefsekAdvisoryAbs = findHefsekAdvisoryDay(db, todayAbs, settings.hefsekAdvisoryDays);
    if (hefsekAdvisoryAbs === todayAbs) {
        const raw = dayTimesRaw(todayAbs, location);
        if (raw) {
            push('hefsek_advisory', null, todayAbs, 'day',
                addMinutes(raw.day.sunset, -60), raw.day.sunset,
                [{ method: 'email', minutes: 120 }, { method: 'popup', minutes: 45 }],
                'לא נרשם הפסק טהרה עדיין - כדאי לבדוק אם הגיע הזמן (הצעה בלבד, לא הוראה הלכתית)\nהופק ע"י לוח טהרה');

            if (settings.mochDachukEnabled) {
                const tzeit = tzeitFor(todayAbs, location);
                if (tzeit) {
                    push('moch', null, todayAbs, 'day',
                        addMinutes(raw.day.sunset, -15), tzeit,
                        [{ method: 'popup', minutes: 0 }],
                        'תזכורת מוך דחוק\nהופק ע"י לוח טהרה');
                }
            }
        }
    }

    return events;
}

/**
 * The advisory day for the hefsek suggestion (see comment above): the most
 * recent recorded reiyah/bleeding-continuation with no hefsek recorded on
 * or after it, once `advisoryDays` have passed since it - or `null` if
 * there is nothing to suggest (no such sighting, or a hefsek already
 * covers it). Returns an abs day so the caller can check it against
 * `todayAbs` - the suggestion is only ever shown for TODAY, not projected
 * into the future, since whether it still applies depends on what she
 * records meanwhile.
 */
function findHefsekAdvisoryDay(db, todayAbs, advisoryDays) {
    const absDays = Object.keys(db || {}).map(Number).sort((a, b) => a - b);
    let lastBleedingStart = null;
    let hefsekSince = false;
    absDays.forEach(abs => {
        if (abs > todayAbs) return;
        const entry = db[abs];
        if (!entry) return;
        if (entry.type === 'reiyah') {
            lastBleedingStart = abs;
            hefsekSince = false;
        } else if (entry.type === 'hefsek') {
            hefsekSince = true;
        }
    });
    if (lastBleedingStart === null || hefsekSince) return null;
    if (todayAbs - lastBleedingStart < advisoryDays) return null;
    return todayAbs;
}

// ---------- Pure reconcile (diff) ----------

/**
 * Decides what must be created, updated or deleted so the calendar matches
 * `expected` exactly (spec §6א, "עקרון הדלתא"). Matching is by `syncKey`
 * alone - the app never re-derives identity from a title or a raw date,
 * since discretion levels can make two different events look identical.
 *
 * `existing` is what fetchExistingAppEvents() returned: events already in
 * the calendar, each carrying its own Google `id` and the `syncKey` this
 * module previously wrote into extendedProperties.private.
 *
 * An update is only queued when the start time actually changed - a summary-
 * only cosmetic difference (e.g. the "discreet" numbering drifting between
 * syncs) is accepted as a known, harmless limitation rather than treated as
 * a reason to rewrite an otherwise-correct event on every single sync.
 */
export function reconcileEvents(expected, existing) {
    const byKey = new Map(existing.map(e => [e.syncKey, e]));
    const expectedKeys = new Set(expected.map(e => e.syncKey));

    const toCreate = [];
    const toUpdate = [];
    expected.forEach(exp => {
        const found = byKey.get(exp.syncKey);
        if (!found) {
            toCreate.push(exp);
            return;
        }
        if (found.startDateTime !== exp.start.dateTime || found.endDateTime !== exp.end.dateTime) {
            toUpdate.push({ id: found.id, event: exp });
        }
    });

    const toDelete = existing
        .filter(e => !expectedKeys.has(e.syncKey))
        .map(e => e.id);

    return { toCreate, toUpdate, toDelete };
}

// ---------- Google Calendar API payload ----------

/**
 * Builds the raw Calendar API event body for one expected event (spec §5).
 */
function toApiPayload(expected) {
    return {
        summary: expected.summary,
        description: expected.description,
        start: expected.start,
        end: expected.end,
        visibility: 'private',
        transparency: 'transparent',
        reminders: expected.reminders,
        extendedProperties: {
            private: {
                app: APP_TAG,
                syncKey: expected.syncKey,
                eventType: expected.eventType,
                dateAbs: String(expected.dateAbs)
            }
        }
    };
}

// ---------- I/O: calendar lifecycle ----------

async function ensureAccessToken() {
    if (!hasApi() || !window.api.oauthEnsureToken) return null;
    return window.api.oauthEnsureToken();
}

/**
 * Finds the app's calendar by its known id (fast path), or by name among the
 * user's calendar list (first connection / id lost), or creates it fresh.
 * The id is then persisted (oauth-set-meta) so every later sync skips the
 * lookup entirely.
 */
export async function getOrCreateAppCalendar() {
    const status = await window.api.oauthStatus();
    if (status.calendarId) {
        // Confirm it still exists - the user could have deleted it by hand.
        const check = await fetch(`${CALENDAR_API}calendars/${encodeURIComponent(status.calendarId)}`, {
            headers: { Authorization: 'Bearer PLACEHOLDER' }
        });
        if (check.ok) return status.calendarId;
    }

    const listRes = await fetch(`${CALENDAR_API}users/me/calendarList?minAccessRole=owner`, {
        headers: { Authorization: 'Bearer PLACEHOLDER' }
    });
    if (listRes.ok) {
        const list = await listRes.json();
        const found = (list.items || []).find(c => c.summary === CALENDAR_SUMMARY);
        if (found) {
            await window.api.oauthSetMeta({ calendarId: found.id });
            return found.id;
        }
    }

    const createRes = await fetch(`${CALENDAR_API}calendars`, {
        method: 'POST',
        headers: { Authorization: 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            summary: CALENDAR_SUMMARY,
            description: 'תזכורות בדיקות וימי פרישה מאפליקציית לוח טהרה',
            timeZone: 'Asia/Jerusalem'
        })
    });
    if (!createRes.ok) throw new Error('calendar_create_failed_' + createRes.status);
    const created = await createRes.json();
    await window.api.oauthSetMeta({ calendarId: created.id });
    return created.id;
}

/**
 * Fetches every future event this app tagged in its own calendar, reduced
 * to just what reconcileEvents() needs (id, syncKey, start/end).
 */
export async function fetchExistingAppEvents(calendarId) {
    const url = `${CALENDAR_API}calendars/${encodeURIComponent(calendarId)}/events`
        + `?timeMin=${encodeURIComponent(new Date().toISOString())}`
        + `&privateExtendedProperty=${encodeURIComponent('app=' + APP_TAG)}`
        + '&maxResults=2500&singleEvents=true';
    const res = await fetch(url, { headers: { Authorization: 'Bearer PLACEHOLDER' } });
    if (!res.ok) throw new Error('fetch_events_failed_' + res.status);
    const data = await res.json();
    return (data.items || []).map(item => ({
        id: item.id,
        syncKey: (item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.syncKey) || '',
        startDateTime: item.start && item.start.dateTime,
        endDateTime: item.end && item.end.dateTime
    })).filter(e => e.syncKey);
}

async function createEvent(calendarId, expected) {
    const res = await fetch(`${CALENDAR_API}calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
        body: JSON.stringify(toApiPayload(expected))
    });
    if (!res.ok) throw new Error('create_event_failed_' + res.status);
}

async function updateEvent(calendarId, id, expected) {
    const res = await fetch(`${CALENDAR_API}calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer PLACEHOLDER', 'Content-Type': 'application/json' },
        body: JSON.stringify(toApiPayload(expected))
    });
    if (!res.ok) throw new Error('update_event_failed_' + res.status);
}

async function deleteEvent(calendarId, id) {
    const res = await fetch(`${CALENDAR_API}calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer PLACEHOLDER' }
    });
    // 410 Gone = already deleted (e.g. by hand) - not a failure worth reporting.
    if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error('delete_event_failed_' + res.status);
}

/**
 * Runs create/update/delete for one reconcile diff, one call at a time
 * (Calendar v3 has no public batch endpoint for these, unlike Sheets). Each
 * call's own failure is caught and reported rather than aborting the whole
 * sync - a single bad event must never block every other correct one.
 */
async function applyReconcile(calendarId, diff) {
    const errors = [];
    for (const expected of diff.toCreate) {
        try { await createEvent(calendarId, expected); } catch (e) { errors.push(e); }
    }
    for (const { id, event } of diff.toUpdate) {
        try { await updateEvent(calendarId, id, event); } catch (e) { errors.push(e); }
    }
    for (const id of diff.toDelete) {
        try { await deleteEvent(calendarId, id); } catch (e) { errors.push(e); }
    }
    return { ok: errors.length === 0, errors, created: diff.toCreate.length, updated: diff.toUpdate.length, deleted: diff.toDelete.length };
}

/**
 * Full sync: builds the expected list, fetches what actually exists,
 * reconciles, and applies. Returns a summary for the settings-screen toast.
 */
export async function syncCalendarNow(db, engineResult, location, todayAbs, settings) {
    if (!hasApi()) throw new Error('Google Calendar sync is only available in the desktop application.');
    const token = await ensureAccessToken();
    if (!token) throw new Error('no_token');

    const calendarId = await getOrCreateAppCalendar();
    const expected = buildExpectedEvents(db, engineResult, location, todayAbs, settings);
    const existing = await fetchExistingAppEvents(calendarId);
    const diff = reconcileEvents(expected, existing);
    const result = await applyReconcile(calendarId, diff);

    await window.api.oauthSetMeta({ calendarLastSyncAt: new Date().toISOString() });
    return result;
}

/**
 * Deletes every event this app ever created in its calendar (spec §8,
 * "נקה את כל תזכורות האפליקציה מהיומן") - the calendar itself is left in
 * place (only a full disconnect removes it), so re-enabling sync afterward
 * just repopulates it from scratch.
 */
export async function clearAllAppEvents() {
    if (!hasApi()) return { ok: false };
    const token = await ensureAccessToken();
    if (!token) return { ok: false };
    const status = await window.api.oauthStatus();
    if (!status.calendarId) return { ok: true, deleted: 0 };

    const existing = await fetchExistingAppEvents(status.calendarId);
    let deleted = 0;
    for (const e of existing) {
        try { await deleteEvent(status.calendarId, e.id); deleted++; } catch (err) { /* best-effort */ }
    }
    return { ok: true, deleted };
}

/**
 * Whether the currently-connected Google account has actually consented to
 * the calendar scope (spec §9 / an existing Sheets-only connection made
 * before this feature shipped). Checked from the granted-scopes string
 * `main.js` records at token-exchange time - never assumed from `connected`
 * alone, since that only proves the Sheets-backup scope was granted.
 */
export function hasCalendarScope(status) {
    return !!(status && status.grantedScopes && status.grantedScopes.indexOf('/auth/calendar') !== -1);
}
