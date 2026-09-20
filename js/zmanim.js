/**
 * זמני הנץ והשקיעה — לבירור **ספק עונה** (B6).
 *
 * ## למה זה נצרך
 *
 * הדין: "ואם ראתה סמוך לנץ החמה או שקיעתה ומסופקת מתי התחילה ראייתה" — חוששת
 * לעונה המאוחרת בלבד `[ד"ט | עמ' 1]`, `[שט כ"ו | עמ' 27–28]`. אלא שהספר עצמו סומך
 * את הספק על **הנץ והשקיעה**, ולכן בלא ידיעת זמניהם אין בירור הספק כלל בידי
 * המשתמשת. המודול הזה מספק אותם; את הדין הוא **אינו** משנה — העונה נשארת בחירת
 * המשתמשת, והחומרא של לחוש לשתי העונות נשארת מתג מפורש (`js/stringencies.js`).
 *
 * ## גבולות המודול
 *
 * 1. **אין שינוי דין.** המודול מחזיר זמנים לתצוגה. אין כאן קביעת עונה אוטומטית
 *    ואין הכנסת חשש מעצמו.
 * 2. **המיקום נבחר בידי המשתמשת** מתוך רשימת מוקדים קבועה; בלא בחירה — אין
 *    זמנים. (אין geocoding מקוון, בכוונה: האפליקציה עובדת מקומית בלבד.)
 * 3. **עונת הלילה של תאריך עברי קודמת ליום שלו.** זהו המוסכם במערכת הזאת
 *    ("העונה ההפוכה: אם הוסת בעונת יום — חוששת לעונת הלילה שלפניו"), ולכן זמני
 *    הלילה נלקחים משקיעת היום הלועזי שלפניו ולא של היום שאחריו.
 */
import { HDate, Zmanim } from '../hebcal.js';

/** מזהה "אין מיקום" — ברירת המחדל. */
export const NO_LOCATION = '';

/**
 * המוקדים המוצעים: קו רוחב, קו אורך ואזור זמן.
 *
 * הרשימה היא בבחינת ברירת מחדל נוחה — ואינה מכרעת דבר הלכתית. מי שאינה נמצאת בה
 * יכולה להוסיף מוקד (ראו `docs/DECISIONS.md`).
 */
export const LOCATIONS = [
    { id: 'jerusalem', label: 'ירושלים', lat: 31.7683, long: 35.2137, tzid: 'Asia/Jerusalem' },
    { id: 'telaviv', label: 'תל אביב', lat: 32.0853, long: 34.7818, tzid: 'Asia/Jerusalem' },
    { id: 'bneibrak', label: 'בני ברק', lat: 32.0807, long: 34.8338, tzid: 'Asia/Jerusalem' },
    { id: 'beitshemesh', label: 'בית שמש', lat: 31.7487, long: 34.9880, tzid: 'Asia/Jerusalem' },
    { id: 'ashdod', label: 'אשדוד', lat: 31.8014, long: 34.6435, tzid: 'Asia/Jerusalem' },
    { id: 'haifa', label: 'חיפה', lat: 32.7940, long: 34.9896, tzid: 'Asia/Jerusalem' },
    { id: 'beersheva', label: 'באר שבע', lat: 31.2530, long: 34.7915, tzid: 'Asia/Jerusalem' },
    { id: 'modiinilit', label: 'מודיעין עילית', lat: 31.9333, long: 35.0333, tzid: 'Asia/Jerusalem' },
    { id: 'newyork', label: 'ניו יורק', lat: 40.7128, long: -74.0060, tzid: 'America/New_York' },
    { id: 'lakewood', label: 'לייקווד', lat: 40.0959, long: -74.2101, tzid: 'America/New_York' },
    { id: 'london', label: 'לונדון', lat: 51.5074, long: -0.1278, tzid: 'Europe/London' },
    { id: 'manchester', label: 'מנצ\'סטר', lat: 53.4808, long: -2.2426, tzid: 'Europe/London' },
    { id: 'antwerp', label: 'אנטוורפן', lat: 51.2194, long: 4.4025, tzid: 'Europe/Brussels' },
    { id: 'zurich', label: 'ציריך', lat: 47.3769, long: 8.5417, tzid: 'Europe/Zurich' },
    { id: 'vienna', label: 'וינה', lat: 48.2082, long: 16.3738, tzid: 'Europe/Vienna' },
    { id: 'montreal', label: 'מונטריאול', lat: 45.5019, long: -73.5674, tzid: 'America/Toronto' }
];

const BY_ID = LOCATIONS.reduce((acc, place) => {
    acc[place.id] = place;
    return acc;
}, {});

/** המוקד לפי מזההו; `null` כשאין מיקום או שהמזהה אינו מוכר. */
export function locationById(id) {
    return BY_ID[id] || null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** שעה:דקות באזור הזמן של המוקד — ובנפילת דרך, בשעון המקומי. */
function formatTime(date, tzid) {
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat('he-IL', {
            hour: '2-digit', minute: '2-digit', timeZone: tzid
        }).format(date);
    } catch (e) {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }
}

/**
 * זמני עונת היום ועונת הלילה של תאריך עברי.
 *
 * @param {number} abs - היום המוחלט (כמו בכל המערכת)
 * @param {Object} location - מוקד מתוך `LOCATIONS` (או `null`)
 * @returns {?{day: {sunrise: string, sunset: string}, night: {sunset: string, sunrise: string}}}
 *          `null` כשאין מיקום או שאין זמנים באותו יום (למשל בקווי רוחב קיצוניים)
 */
function rawDayTimes(abs, location) {
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.long)) return null;

    let greg;
    try {
        greg = new HDate(abs).greg();
    } catch (e) {
        return null;
    }

    const previous = new Date(greg.getTime() - DAY_MS);
    const sunrise = new Zmanim(greg, location.lat, location.long).sunrise();
    const sunset = new Zmanim(greg, location.lat, location.long).sunset();
    const nightSunset = new Zmanim(previous, location.lat, location.long).sunset();
    if (!sunrise || !sunset) return null;

    return {
        day: { sunrise, sunset },
        // עונת הלילה של התאריך העברי אינה אלא הלילה שלפני יום שלו.
        night: { sunset: nightSunset, sunrise }
    };
}

export function dayTimes(abs, location) {
    const raw = rawDayTimes(abs, location);
    if (!raw) return null;

    return {
        day: {
            sunrise: formatTime(raw.day.sunrise, location.tzid),
            sunset: formatTime(raw.day.sunset, location.tzid)
        },
        night: {
            sunset: formatTime(raw.night.sunset, location.tzid),
            sunrise: formatTime(raw.night.sunrise, location.tzid)
        }
    };
}

/**
 * כמו `dayTimes`, אבל מחזיר אובייקטי `Date` אמיתיים ולא מחרוזות תצוגה —
 * לשימוש בכל מקום שצריך לחשב זמן בפועל (למשל בניית `dateTime` לאירועי
 * יומן גוגל, `js/googleCalendar.js`), ולא רק להציג אותו.
 */
export function dayTimesRaw(abs, location) {
    return rawDayTimes(abs, location);
}

/**
 * "היום" ההלכתי הנוכחי — abs, מתחשב בכך שהיום העברי מתחלף בשקיעה ולא בחצות.
 *
 * `new HDate().abs()` (בלי ארגומנט) גוזר את התאריך העברי מהתאריך הלועזי הנוכחי
 * לפי חצות, ולכן בין השקיעה לחצות הלילה הוא עדיין "אתמול" עברית, בזמן שהיום
 * העברי כבר התחלף. הפער הזה משפיע על כל התראה או חשש שנבחן "האם היום הוא יום
 * הוסת" (למשל תזכורת וסת הגוף, `js/app.js` `announceBodyReminder`), ועל
 * `calculateEngine` עצמו כברירת המחדל של `options.today`.
 *
 * כשיש מיקום מוגדר — הזמן הנוכחי נבדק מול שקיעת התאריך הלועזי הנוכחי במיקום זה,
 * ואם השקיעה כבר עברה, "היום" מוקדם ביום אחד. **בלא מיקום מוגדר אין דרך לחשב
 * שקיעה אמיתית**, ולכן מוחזר התאריך לפי חצות (ההתנהגות הקודמת) — פער ידוע
 * ומתועד, ולא ניחוש שגוי.
 */
export function halachicTodayAbs(location, now = new Date()) {
    const gregorianAbs = new HDate(now).abs();
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.long)) {
        return gregorianAbs;
    }
    let sunset;
    try {
        sunset = new Zmanim(now, location.lat, location.long).sunset();
    } catch (e) {
        return gregorianAbs;
    }
    if (!sunset) return gregorianAbs;
    return now >= sunset ? gregorianAbs + 1 : gregorianAbs;
}

/** שורת הזמנים להצגה; מחרוזת ריקה כשאין מיקום או שאין זמנים. */
export function timesLine(abs, location) {
    const t = dayTimes(abs, location);
    if (!t) return '';
    return `עונת היום (${t.day.sunrise}–${t.day.sunset}): הנץ ${t.day.sunrise} · שקיעה ${t.day.sunset}`
        + ` · עונת הלילה (${t.night.sunset}–${t.night.sunrise}): שקיעה ${t.night.sunset} (מן היום שלפניו)`
        + ` · הנץ ${t.night.sunrise}`;
}
