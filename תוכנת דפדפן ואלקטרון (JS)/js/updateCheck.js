/**
 * בדיקת גרסה חדשה מול GitHub Releases (אפיון תוספות עתידיות מתוכננות.txt, שורות 6–8).
 *
 * **מה יש כאן:** בדיקה יומית (מ-`api.github.com`, בלי טוקן — ל-releases ציבוריים
 * אין בכך צורך) שמשווה את התג האחרון שפורסם מול הגרסה המותקנת, ובאנר עם קישור
 * לדף ה-Release (הורדה + הערות גרסה) שניתן לדחות לשבוע.
 *
 * **מה אין כאן:** התקנה שקטה מתוך האפליקציה (`electron-updater`/`autoUpdater`).
 * זה ידרוש קבצי `latest.yml` שנוצרים על-ידי `electron-builder` בפרסום Release
 * אמיתי, ואי אפשר לאמת את מסלול ההתקנה-בפועל מסביבת הפיתוח הזו. הבאנר מפנה
 * את המשתמשת לדף ה-Release להורדה ידנית, ומזכיר לגבות קודם.
 */

const REPO = 'Lev-Good/Purification-board';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * משווה שני מספרי גרסה בתבנית "x.y.z" (חלקים חסרים = 0). מחזיר 1 אם a>b,
 * -1 אם a<b, 0 אם שווים. תגי גרסה לא-מספריים (build metadata וכו') מתעלמים.
 */
export function compareVersions(a, b) {
    const pa = String(a || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
}

/**
 * שולפת את ה-release העדכני מ-GitHub. מחזירה `null` בהעדר רשת/מאגר/release,
 * ולעולם לא זורקת — בדיקת עדכון אינה קריטית, וכשלה חייב להיות שקוף למשתמשת.
 */
export async function fetchLatestRelease() {
    try {
        const res = await fetch(RELEASES_API, {
            headers: { Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data.tag_name) return null;
        return {
            version: String(data.tag_name).replace(/^v/i, ''),
            url: data.html_url || `https://github.com/${REPO}/releases/latest`,
            notes: data.body || '',
            publishedAt: data.published_at || ''
        };
    } catch (e) {
        return null; // offline, rate-limited, or no releases yet
    }
}

/**
 * הבדיקה המלאה: גרסה נוכחית מול ה-release העדכני. `hasUpdate` הוא ה-boolean
 * היחיד שהקוד הקורא צריך כדי להחליט אם להציג את הבאנר.
 */
export async function checkForUpdate(currentVersion) {
    const latest = await fetchLatestRelease();
    if (!latest) return { hasUpdate: false, latest: null };
    return {
        hasUpdate: compareVersions(latest.version, currentVersion) > 0,
        latest
    };
}
