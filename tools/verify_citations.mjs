#!/usr/bin/env node
/**
 * אימות מראי המקום של "שיעורי טהרה" שבקוד ובתיעוד.
 *
 * הרעיון: הציטוטים בקוד ובאפיון הם מן הצורה `[שט N | עמ' P]`, ו-N הוא מספור
 * ה**שיעורים** שבספר (ולא מספור פרקים). התמלול עצמו נושא סימונים של כותרות
 * השיעור, שבגוף הספר הן כותרות משנה:
 *
 *     ===== PAGE n =====
 *     * שיעור עשרים ושבע
 *
 * ומהם נגזרת הטבלה "איזה עמוד שייך לאיזה שיעור". הסקריפט מאמת כל ציטוט שנמצא
 * בקוד ובתיעוד: השיעור שבציטוט מול העמוד — וכך נתפסים מראי מקום שנכתבו מן הזיכרון.
 *
 * הרצה:
 *   node tools/verify_citations.mjs               — דיווח על אי־התאמות (exit 0)
 *   node tools/verify_citations.mjs --strict      — נכשל (exit 1) על כל אי־התאמה
 *   node tools/verify_citations.mjs --dry-run     — הראה מה יתוקן, בלא לכתוב
 *   node tools/verify_citations.mjs --fix         — תקן את מספרי השיעורים שבציטוטים
 *
 * **מה שנמצא בפועל (2026-09-17 — ראו docs/DECISIONS.md):**
 * 1. **מספרי העמודים מדויקים**: כל עמוד בציטוט מתיישב עם התמלול.
 * 2. **מספרי השיעורים אינם מדויקים** בחלק ניכר מן הציטוטים. הסימונים שבתמלול
 *    הם כותרות השיעור **המודפסות בגוף הספר** (18 כותרות, שיעור כ"ד–מ"א — אחת
 *    לכל שיעור, לרוב בתחתית הטור הימני של העמוד שבו השיעור מתחיל), ולכן הם
 *    מקור מהימן לקביעת גבולות השיעורים; ואילו מספרי השיעורים שבציטוטים נכתבו
 *    ממספרים שאינם מתיישבים עמם — ולפעמים סותרים זה את זה באותו אזור עצמו.
 * 3. על כן ברירת המחדל כאן היא **דיווח**, והתיקון מוצע ב-`--fix` בלבד.
 *
 * **סבב שני (2026-09-17, אחרי הצהריים) — 19 הציטוטים שנותרו נסגרו:**
 * 4. **שלושה מן ה-19 אינם ציטוטי שיעור אלא ציטוטי פרק**, ולכן סומנו במפורש
 *    `[שט פרק כ"ז | עמ' 92–101]` (מספור הפרקים — הכותרת הרצה שבשער העמוד).
 * 5. **ציטוט טווח נבחן לפי קצותיו:** די שתחילתו או סופו של טווח העמודים יפול
 *    בתחום הנקוב, שכן גבול השיעור עובר **בתוך** העמוד (כותרת השיעור יושבת
 *    בתחתית הטור הימני), ולכן טווח החולש על הגבול הוא ציטוט נכון.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRANSCRIPT = join(ROOT, 'מקורות - תמלולים', 'שיעורי טהרה.txt');

const LETTERS = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80,
    'צ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400
};
const WORDS = {
    'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50,
    'אחת': 1, 'שתים': 2, 'שניים': 2, 'שנים': 2, 'שלש': 3, 'שלוש': 3, 'ארבע': 4,
    'חמש': 5, 'שש': 6, 'שבע': 7, 'שמונה': 8, 'תשע': 9, 'עשר': 10,
    'ואחת': 1, 'ושתים': 2, 'ושלש': 3, 'ושלוש': 3, 'וארבע': 4,
    'וחמש': 5, 'ושש': 6, 'ושבע': 7, 'ושמונה': 8, 'ותשע': 9, 'ועשר': 10
};
const NUMERAL_LETTERS = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'],
    [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
    [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
];

/** "כ\"ז" → 27 · "מ\"א" → 41 · "ל"ד" → 34 (התו `\` של המילוט נזרק) */
function hebrewNumeral(raw) {
    const cleaned = String(raw).replace(/[\\"'\u05F4\u05F3\s]/g, '');
    if (!cleaned) return null;
    if (/^\d+$/.test(cleaned)) return Number(cleaned);
    let sum = 0;
    for (const ch of cleaned) {
        if (!LETTERS[ch]) return null;
        sum += LETTERS[ch];
    }
    return sum || null;
}

/** 27 → כ"ז · 30 → ל' · 41 → מ"א */
function toHebrewNumeral(number) {
    let rest = Number(number);
    let out = '';
    for (const [value, letter] of NUMERAL_LETTERS) {
        while (rest >= value) { out += letter; rest -= value; }
    }
    if (out.length === 0) return String(number);
    return out.length === 1 ? `${out}'` : `${out.slice(0, -1)}"${out.slice(-1)}`;
}

/** "עשרים ושבע" → 27 */
function hebrewWordsToNumber(text) {
    const words = String(text).trim().split(/\s+/);
    let total = 0;
    let matched = false;
    for (const w of words) {
        if (WORDS[w] === undefined) return null;
        total += WORDS[w];
        matched = true;
    }
    return matched ? total : null;
}

// ---------- 1. בניית מפת השיעורים מן התמלול ----------

const transcript = readFileSync(TRANSCRIPT, 'utf8').split(/\r?\n/);
const lessons = [];   // { lesson, fromPage, sourceLine }
let page = 0;
transcript.forEach((line, index) => {
    const pageMatch = line.match(/^===== PAGE (\d+) =====/);
    if (pageMatch) { page = Number(pageMatch[1]); return; }
    const lessonMatch = line.match(/^\* שיעור (.+)$/);
    if (!lessonMatch) return;
    const num = hebrewWordsToNumber(lessonMatch[1]);
    if (num !== null) lessons.push({ lesson: num, fromPage: page, sourceLine: index + 1 });
});

if (lessons.length === 0) {
    console.error('לא נמצאו סימוני שיעור בתמלול — אין מה לאמת.');
    process.exit(1);
}

/** הטווח [fromPage, toPage] של כל שיעור, לפי הכותרות שבגוף הספר. */
const ranges = lessons.map((entry, i) => ({
    lesson: entry.lesson,
    title: toHebrewNumeral(entry.lesson),
    fromPage: entry.fromPage,
    toPage: i + 1 < lessons.length ? lessons[i + 1].fromPage - 1 : Infinity
}));
const rangeOf = (lesson) => ranges.find(r => r.lesson === lesson) || null;
const lessonOfPage = (page) => (ranges.find(r => page >= r.fromPage && page <= r.toPage) || null);

/**
 * מפת **הפרקים** — מספור הספר העיקרי, לפי הכותרת הרצה שבשער כל עמוד
 * ("שיעורי טהרה — פרק כ\"ב"). הטווחים הם מ-`docs/SPEC_DINIM_VESATOT.md` §0.3,
 * ואומתו שוב (2026-09-17) מול הכותרות שחילץ הכלי מן ה-PDF עצמו: עמ' 18 —
 * "בדיקה באשה שיש", עמ' 24 — "פרישה בשעת", עמ' 92 — "עונה", עמ' 150 —
 * "דיני וסת הדילוג", עמ' 153/157 — פרק ל', עמ' 189 — ל\"ב.
 * ציטוט המכוון לפרק נכתב במפורש `[שט פרק N | עמ' P]`.
 */
const CHAPTER_RANGES = [
    { lesson: 22, title: 'כ"ב', fromPage: 1, toPage: 23, name: 'בדיקה באשה שיש ושאין לה וסת' },
    { lesson: 23, title: 'כ"ג', fromPage: 24, toPage: 63, name: 'פרישה בשעת הוסת ובסמוך לו' },
    { lesson: 24, title: 'כ"ד', fromPage: 64, toPage: 73, name: 'דיני וסתות במעוברת ומניקה' },
    { lesson: 25, title: 'כ"ה', fromPage: 74, toPage: 77, name: 'דיני וסתות בקטנה וזקנה' },
    { lesson: 26, title: 'כ"ו', fromPage: 78, toPage: 91, name: 'בדיקה ביום הוסת' },
    { lesson: 27, title: 'כ"ז', fromPage: 92, toPage: 101, name: 'עונה בינונית' },
    { lesson: 28, title: 'כ"ח', fromPage: 102, toPage: 107, name: 'וסת לימים המתחלפים' },
    { lesson: 29, title: 'כ"ט', fromPage: 108, toPage: 140, name: 'אופני הוסתות וקביעותם' },
    { lesson: 30, title: 'ל\'', fromPage: 141, toPage: 157, name: 'דיני וסת הדילוג, הסירוג, ווסת השבוע' },
    { lesson: 31, title: 'ל"א', fromPage: 158, toPage: 181, name: 'וסת הגוף ווסת האונס' },
    { lesson: 32, title: 'ל"ב', fromPage: 182, toPage: 189, name: 'דיני עקירת הוסת הקבוע' }
];
const chapterOfPage = (page) => (CHAPTER_RANGES.find(c => page >= c.fromPage && page <= c.toPage) || null);

// ---------- 2. איסוף הציטוטים ----------

// תומך בציטוטים שבתוך מחרוזות JS, שבהם המפריד והגרש כתובים במילוט
// ([שט כ\"ז \| עמ\' 41]), ובציטוט של כמה עמודים ([שט כ\"ט | עמ\' 63, 66]).
const CITATION = /\[שט\s+(פרק\s+)?([^|\]]+?)\s*\\?\|\s*(?:פרק\s*)?עמ\\?['\u2019]?\s*([0-9]+(?:\s*[–-]\s*[0-9]+)?(?:\s*,\s*[0-9]+(?:\s*[–-]\s*[0-9]+)?)*)\s*[`'"]?\s*\]/g;
const LOOSE_CITATION = /\[שט\s([^\]]*)\]/g;

/** "63, 66–67" → [63, 66, 67] */
function parsePages(field) {
    return field.split(',').flatMap(part =>
        part.split(/[–-]/).map(s => Number(s.trim())).filter(Number.isFinite));
}

function collectFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name === 'מקורות - תמלולים') continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) { collectFiles(full, out); continue; }
        if (/\.(js|mjs|md|html)$/.test(name)) out.push(full);
    }
    return out;
}

const files = collectFiles(ROOT);
const found = [];        // { file, line, lesson, pages[], raw, token }
const unparsed = [];     // ציטוטי שט שלא זוהו כבעלי שיעור ועמוד

// תיעוד שמפרט את **הציטוטים הבעייתיים עצמם** (למשל רשימת "הנותרים לעיון")
// היה נספר בעצמו כציטוט. לפיכך שורות שבתוך `<!-- verify-ignore -->` ...
// `<!-- verify-ignore-end -->` אינן נסרקות כלל (ההערה אינה נראית במרקדאון).
const IGNORE_START = 'verify-ignore -->';
const IGNORE_END = 'verify-ignore-end -->';

files.forEach(file => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let ignoring = false;
    lines.forEach((line, i) => {
        // החרגה באותה שורה: הסירו את מה שבין שתי ההערות, וסרקו את השאר.
        let text = line.replace(/verify-ignore -->[\s\S]*?verify-ignore-end -->/g, '');
        if (text.includes(IGNORE_START)) { ignoring = true; return; }
        if (ignoring) {
            if (line.includes(IGNORE_END)) ignoring = false;
            return;
        }
        const seen = [];
        CITATION.lastIndex = 0;
        let m;
        while ((m = CITATION.exec(text)) !== null) {
            const isChapter = Boolean(m[1]);
            const lesson = hebrewNumeral(m[2].trim());
            seen.push(m.index);
            if (lesson === null) continue;
            found.push({
                file: file.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, ''),
                line: i + 1,
                lesson,
                isChapter,
                pages: parsePages(m[3]),
                raw: m[0],
                token: m[2].trim()
            });
        }
        LOOSE_CITATION.lastIndex = 0;
        while ((m = LOOSE_CITATION.exec(text)) !== null) {
            if (/\d/.test(m[0]) && !seen.includes(m.index)) {
                unparsed.push({
                    file: file.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, ''),
                    line: i + 1, raw: m[0]
                });
            }
        }
    });
});

// ---------- 3. האימות ----------

let checked = 0;
const problems = [];     // { citation, pages, actual, actuals }
const unknownLesson = [];

/**
 * הציטוט מתיישב אם **תחילתו או סופו** של טווח העמודים נופל בתחום הנקוב
 * (לציטוט של עמוד אחד — אותו עמוד). הטווח נבחן בקצותיו מפני שגבול השיעור
 * עובר בתוך העמוד: כותרת השיעור יושבת בתחתית הטור הימני, ולכן העמוד שממנו
 * מתחיל שיעור חדש מכיל עדיין גם מסוף השיעור הקודם.
 */
function matches(citation, range) {
    const edges = [citation.pages[0], citation.pages[citation.pages.length - 1]];
    return edges.some(p => p >= range.fromPage && p <= range.toPage);
}

found.forEach(c => {
    const pool = c.isChapter ? CHAPTER_RANGES : ranges;
    const range = pool.find(r => r.lesson === c.lesson) || null;
    if (!range) {
        unknownLesson.push(c);
        return;
    }
    checked += c.pages.length;
    if (matches(c, range)) return;
    const actuals = [...new Set(c.pages.map(p => {
        const where = c.isChapter ? chapterOfPage(p) : lessonOfPage(p);
        return where ? where.lesson : null;
    }))];
    problems.push({
        citation: c,
        pages: c.pages,
        actual: actuals.length === 1 ? actuals[0] : null,
        actuals
    });
});

// סיכום לפי הקבוצה "מה שנכתב → מה שצריך".
const groupsOf = new Map();
problems.forEach(p => {
    const key = `${p.citation.lesson}->${p.actual === null ? '?' : p.actual}`;
    if (!groupsOf.has(key)) groupsOf.set(key, { from: p.citation.lesson, to: p.actual, items: [] });
    groupsOf.get(key).items.push(p);
});

// התיקון: המספר נגזר מן העמוד (שיעור לפי הטבלה שבגוף הספר, פרק לפי הכותרת
// הרצה). ציטוט החולש על שני שיעורים — לא מתוקן מאליו, מחמת שאינו ניתן
// להכרעה בידי הסקריפט.
function correctionOf(citation) {
    const where = citation.isChapter ? chapterOfPage : lessonOfPage;
    const targets = [...new Set(citation.pages.map(p => (where(p) || {}).lesson).filter(Boolean))];
    if (targets.length !== 1 || targets[0] === citation.lesson) return null;
    return targets[0];
}

// **מה מתוקן אוטומטית ומה לא:** קבוצה מתוקנת היא קבוצה שנמצאה בה **הסטה
// אחידה של שיעור אחד** (הציטוט גבוה מהשיעור שבספר או נמוך ממנו בשיעור אחד),
// ויש בה **לפחות חמישה ציטוטים** — שאז ברור שמקור התקלה בטבלה שקדמה לזו
// (הסטת גבול), ולא בשגיאה נקודתית. הסטה גדולה מאחת, או קבוצה קטנה —
// **אינה מתוקנת**, ומוצגת לעיון אנושי: במקרים אלה קרוב הדבר שהעמוד עצמו
// (ולא מספר השיעור) הוא שנכתב שלא במדויק, ותיקון מספר השיעור היה מטעה.
const MIN_GROUP = 5;
function isSystematic(group) {
    return group.items.length >= MIN_GROUP
        && group.items.every(i => Math.abs(i.citation.lesson - i.actual) === 1)
        // אין לערבב בקבוצה אחת ציטוטי שיעור עם ציטוטי פרק — המספורים באותו
        // מרחב מספרי, וקבוצה מעורבת הייתה מתוקנת שלא כהלכה.
        && new Set(group.items.map(i => i.citation.isChapter)).size === 1;
}

const planned = new Map();     // מה שיתוקן
const forReview = [];          // מה שטעון עיון
problems.forEach(problem => {
    const c = problem.citation;
    const target = correctionOf(c);
    const group = groupsOf.get(`${c.lesson}->${problem.actual}`);
    if (target === null || !group || !isSystematic(group)) {
        forReview.push({ citation: c, page: problem.page, actual: problem.actual, target });
        return;
    }
    planned.set(`${c.file}:${c.line}:${c.raw}`, { citation: c, target });
});

// ---------- 4. הדיווח ----------

console.log('טבלת השיעורים כפי שהיא נגזרת מכותרות השיעור שבגוף הספר:');
ranges.forEach(r => console.log(
    `  שיעור ${r.title.padEnd(4)}: עמודים ${r.fromPage}–${Number.isFinite(r.toPage) ? r.toPage : '…'}`
    + `   (הכותרת בתמלול, שורה ${lessons.find(l => l.lesson === r.lesson).sourceLine})`));

console.log('\nטבלת הפרקים (המספור העיקרי — הכותרת הרצה שבשער העמוד):');
CHAPTER_RANGES.forEach(c => console.log(
    `  פרק ${c.title.padEnd(4)}: עמודים ${c.fromPage}–${c.toPage}   (${c.name})`));

const chapterCitations = found.filter(c => c.isChapter).length;
console.log(`\nנמצאו ${found.length} מראי מקום בשט ב-${new Set(found.map(f => f.file)).size} קבצים `
    + `(מהם ${chapterCitations} ציטוטי פרק); ${checked} עמודים נבדקו.`);

if (unparsed.length) {
    console.log(`\n${unparsed.length} ציטוטי שט שלא זוהו כבעלי שיעור ועמוד:`);
    unparsed.forEach(u => console.log(`  ${u.file}:${u.line} — ${u.raw}`));
}

if (unknownLesson.length) {
    console.log(`\n${unknownLesson.length} ציטוטים ששיעורם אינו בטווח השיעורים שבתמלול:`);
    unknownLesson.forEach(c => console.log(`  ${c.file}:${c.line} — ${c.raw}`));
}

if (problems.length === 0) {
    console.log('\nכל מראי המקום מתיישבים עם הספר.');
    // גם ציטוט פגום — חסר שיעור/פרק או מספר שאינו בטווח — הוא אי־התאמה.
    if (process.argv.includes('--strict') && (unparsed.length || unknownLesson.length)) process.exit(1);
    process.exit(0);
}

console.log(`\n${problems.length} מראי מקום אינם מתיישבים עם הספר. `
    + `ריכוז לפי התיקון הנדרש:`);
[...groupsOf.values()]
    .sort((a, b) => b.items.length - a.items.length)
    .forEach(g => {
        const pages = [...new Set(g.items.flatMap(i => i.pages))].sort((a, b) => a - b);
        const kind = g.items[0].citation.isChapter ? 'פרק' : 'שיעור';
        console.log(`  ${kind} ${toHebrewNumeral(g.from).padEnd(4)} → `
            + `${g.to === null ? 'לא ידוע' : toHebrewNumeral(g.to).padEnd(4)}`
            + `  (${g.items.length} מקומות; עמודים ${pages[0]}–${pages[pages.length - 1]})`
            + `${isSystematic(g) ? '  [הסטה אחידה — לתיקון אוטומטי]' : '  [טעון עיון]'}`);
    });

console.log('\nפירוט:');
problems.forEach(p => {
    const { citation } = p;
    const kind = citation.isChapter ? 'פרק' : 'שיעור';
    const where = p.pages.length > 1
        ? `העמודים ${p.pages[0]}–${p.pages[p.pages.length - 1]}`
        : `העמוד ${p.pages[0]}`;
    const actual = p.actuals.map(a => a === null ? '?' : toHebrewNumeral(a)).join(' / ');
    console.log(`  ${citation.file}:${citation.line} — ${citation.raw}`
        + `: ${where} אינם ב${kind} ${citation.token} (הם ב${kind} ${actual})`);
});

console.log(`\n${planned.size} ציטוטים ניתנים לתיקון אוטומטי `
    + '(N = מספר השיעור לפי העמוד). יריצו `--fix` לתיקון, או `--dry-run` לתצוגה מוקדמת.');

if (forReview.length) {
    const reviewFiles = new Set(forReview.map(r => r.citation.file));
    const reviewKeys = new Set(forReview.map(r => `${r.citation.file}:${r.citation.line}:${r.citation.raw}`));
    console.log(`\n${reviewKeys.size} ציטוטים אינם מתוקנים אוטומטית (הסטה שאינה אחידה, `
        + `או ציטוט החולש על שני שיעורים) — ב-${reviewFiles.size} קבצים. `
        + 'במקרים אלה יש לברר אם **העמוד** הוא שנכתב שלא במדויק:');
    [...reviewKeys].forEach(key => console.log(`  ${key}`));
}

// ---------- 5. תיקון ----------

const mode = process.argv.includes('--fix') ? 'fix'
    : process.argv.includes('--dry-run') ? 'dry' : null;

if (mode) {
    const byFile = new Map();
    planned.forEach(entry => {
        const { citation, target } = entry;
        if (!byFile.has(citation.file)) byFile.set(citation.file, []);
        byFile.get(citation.file).push({ citation, target });
    });

    byFile.forEach((entries, file) => {
        const full = join(ROOT, file);
        let text = readFileSync(full, 'utf8');
        let updated = 0;
        entries.forEach(({ citation, target }) => {
            // מספר השיעור החדש נכתב בסגנון המילוט של המקור (כ\"ז מול כ"ז), כדי
            // שהציטוט יישאר תקין בין אם הוא במרקדאון ובין אם בתוך מחרוזת JS.
            const escaped = citation.token.includes('\\');
            let numeral = toHebrewNumeral(target);
            if (escaped) numeral = numeral.replace(/"/g, '\\"').replace(/'/g, "\\'");
            const replacement = citation.raw.replace(citation.token, numeral);
            if (replacement === citation.raw) return;
            if (mode === 'fix') text = text.split(citation.raw).join(replacement);
            updated++;
            if (mode === 'dry') {
                console.log(`  ${file}:${citation.line} — ${citation.raw} → ${replacement}`);
            }
        });
        if (mode === 'fix' && updated) writeFileSync(full, text, 'utf8');
        console.log(`${mode === 'fix' ? 'תוקנו' : 'ייתוקנו'} ${updated} ציטוטים ב-${file}`);
    });

    if (mode === 'fix') {
        console.log('\nהתיקון בוצע. הריצו שוב בלא דגלים כדי לאמת.');
    }
}

if (process.argv.includes('--strict')) process.exit(1);
