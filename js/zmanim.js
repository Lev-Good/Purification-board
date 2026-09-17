import { HDate, Location, Zmanim } from '../hebcal.js';

// Curated subset of Hebcal's built-in "classic cities" (Location.lookup keys), Hebrew labels.
// Israeli cities first (primary audience), then world cities alphabetically by Hebrew label.
export const CITIES = [
    { key: 'Jerusalem', label: 'ירושלים' },
    { key: 'Tel Aviv', label: 'תל אביב' },
    { key: 'Haifa', label: 'חיפה' },
    { key: 'Beer Sheva', label: 'באר שבע' },
    { key: 'Eilat', label: 'אילת' },
    { key: 'Ashdod', label: 'אשדוד' },
    { key: 'Petach Tikvah', label: 'פתח תקווה' },
    { key: 'Tiberias', label: 'טבריה' },
    { key: 'Atlanta', label: 'אטלנטה' },
    { key: 'Austin', label: 'אוסטין' },
    { key: 'Baghdad', label: 'בגדד' },
    { key: 'Berlin', label: 'ברלין' },
    { key: 'Baltimore', label: 'בולטימור' },
    { key: 'Bogota', label: 'בוגוטה' },
    { key: 'Boston', label: 'בוסטון' },
    { key: 'Budapest', label: 'בודפשט' },
    { key: 'Buenos Aires', label: 'בואנוס איירס' },
    { key: 'Buffalo', label: 'באפלו' },
    { key: 'Chicago', label: 'שיקגו' },
    { key: 'Cincinnati', label: 'סינסינטי' },
    { key: 'Cleveland', label: 'קליבלנד' },
    { key: 'Dallas', label: 'דאלאס' },
    { key: 'Denver', label: 'דנוור' },
    { key: 'Detroit', label: 'דטרויט' },
    { key: 'Gibraltar', label: 'גיברלטר' },
    { key: 'Hawaii', label: 'הוואי' },
    { key: 'Helsinki', label: 'הלסינקי' },
    { key: 'Houston', label: 'יוסטון' },
    { key: 'Johannesburg', label: 'יוהנסבורג' },
    { key: 'Kiev', label: 'קייב' },
    { key: 'La Paz', label: 'לה פס' },
    { key: 'Livingston', label: 'ליווינגסטון' },
    { key: 'Las Vegas', label: 'לאס וגאס' },
    { key: 'London', label: 'לונדון' },
    { key: 'Los Angeles', label: 'לוס אנג\'לס' },
    { key: 'Marseilles', label: 'מרסיי' },
    { key: 'Miami', label: 'מיאמי' },
    { key: 'Minneapolis', label: 'מיניאפוליס' },
    { key: 'Melbourne', label: 'מלבורן' },
    { key: 'Mexico City', label: 'מקסיקו סיטי' },
    { key: 'Montreal', label: 'מונטריאול' },
    { key: 'Moscow', label: 'מוסקבה' },
    { key: 'New York', label: 'ניו יורק' },
    { key: 'Omaha', label: 'אומהה' },
    { key: 'Ottawa', label: 'אוטווה' },
    { key: 'Panama City', label: 'פנמה סיטי' },
    { key: 'Paris', label: 'פריז' },
    { key: 'Pawtucket', label: 'פוטקט' },
    { key: 'Philadelphia', label: 'פילדלפיה' },
    { key: 'Phoenix', label: 'פיניקס' },
    { key: 'Pittsburgh', label: 'פיטסבורג' },
    { key: 'Providence', label: 'פרובידנס' },
    { key: 'Portland', label: 'פורטלנד' },
    { key: 'Saint Louis', label: 'סנט לואיס' },
    { key: 'Saint Petersburg', label: 'סנט פטרבורג' },
    { key: 'San Diego', label: 'סן דייגו' },
    { key: 'San Francisco', label: 'סן פרנסיסקו' },
    { key: 'Sao Paulo', label: 'סאו פאולו' },
    { key: 'Seattle', label: 'סיאטל' },
    { key: 'Sydney', label: 'סידני' },
    { key: 'Toronto', label: 'טורונטו' },
    { key: 'Vancouver', label: 'ונקובר' },
    { key: 'White Plains', label: 'וייט פליינס' },
    { key: 'Washington DC', label: 'וושינגטון הבירה' },
    { key: 'Worcester', label: 'ווסטר' }
];

const cityCache = Object.create(null);

/**
 * Resolve a Hebcal Location instance from a city key, with caching.
 */
function resolveLocation(cityKey) {
    if (!cityKey) return null;
    if (cityCache[cityKey] !== undefined) return cityCache[cityKey];
    const loc = Location.lookup(cityKey) || null;
    cityCache[cityKey] = loc;
    return loc;
}

/**
 * Returns the sunset Date for a given city on a given Gregorian date, or null if no city configured.
 */
export function getSunset(cityKey, gregDate = new Date()) {
    const loc = resolveLocation(cityKey);
    if (!loc) return null;
    try {
        return new Zmanim(gregDate, loc.getLatitude(), loc.getLongitude()).sunset();
    } catch (e) {
        console.error('Zmanim sunset calculation failed:', e);
        return null;
    }
}

/**
 * Halachic-aware "today" as an absolute day number (Hebcal Rata Die).
 * If a city is configured and the current time is past sunset, the halachic day has
 * already rolled over to the next Hebrew date (Jewish day begins at nightfall).
 * Falls back to the plain Gregorian-midnight-based "today" when no city is configured.
 */
export function getHalachicTodayAbs(cityKey) {
    const civilTodayAbs = new HDate().abs();
    if (!cityKey) return civilTodayAbs;

    const now = new Date();
    const sunsetToday = getSunset(cityKey, now);
    if (!sunsetToday) return civilTodayAbs;

    return now >= sunsetToday ? civilTodayAbs + 1 : civilTodayAbs;
}

/**
 * Formats a sunset Date as a localized HH:MM string, or '-' if unavailable.
 */
export function formatSunsetTime(sunsetDate) {
    if (!sunsetDate) return '-';
    return sunsetDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
