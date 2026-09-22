/**
 * מסך סטטיסטיקה ותובנות אישיות (`docs/SPEC_FERTILITY_INSIGHTS.md`, פרק ב').
 *
 * מנוע סטטיסטי **עצמאי**: בונה `reiyot` ישירות מתוך ה-`db`, ואינו תלוי בקריאה
 * ל-`calculateEngine` המלא (מתגי חומרא, וסת קבוע וכו') — כדי שהמסך יעבוד ויציג
 * מדדים גם כשהמנוע ההלכתי משביתם. מדדי הנקיים/הטבילה כאן הם לכן **גזירה מקומית
 * ופשוטה** משלה (לא משתפת קוד עם `js/calculations.js:730-781`), במכוון.
 *
 * ההבהרה הרפואית/הלכתית (§2 באפיון) חלה גם על מסך זה.
 */
import { HDate } from '../hebcal.js';
import { bodySignLabel } from './vesetGuf.js';

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_CYCLES_SHOWN = 12;
const OUTLIER_STDDEV_FACTOR = 3;
const OUTLIER_ABSOLUTE_DAYS = 60;

/** ראייה שאינה נכנסת לחישוב סטטיסטי של מחזור טבעי (אונס/כדורים) — §4.6. */
function isNaturalSighting(r) {
    return r.kind !== 'ones' && r.kind !== 'pills';
}

function buildReiyotFromDb(db) {
    const absDays = Object.keys(db || {}).map(Number).sort((a, b) => a - b);
    return absDays
        .filter(abs => db[abs] && db[abs].type === 'reiyah')
        .map(abs => {
            const entry = db[abs];
            return {
                abs,
                hdate: new HDate(abs),
                ona: entry.ona,
                kind: entry.kind || 'regular',
                durationDays: entry.durationDays,
                signs: Array.isArray(entry.signs) ? entry.signs.slice() : []
            };
        });
}

function mean(list) {
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function median(list) {
    if (!list.length) return null;
    const sorted = list.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function populationStdDev(list, avg) {
    if (!list.length) return null;
    const m = Number.isFinite(avg) ? avg : mean(list);
    const variance = list.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / list.length;
    return Math.sqrt(variance);
}

function mode(list) {
    if (!list.length) return null;
    const counts = new Map();
    list.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let best = null, bestCount = -1;
    counts.forEach((count, value) => {
        if (count > bestCount) { best = value; bestCount = count; }
    });
    return best;
}

function stabilityOf(stdDev) {
    if (stdDev === null) return { tag: null, label: null };
    if (stdDev <= 2.0) return { tag: 'very-regular', label: 'מחזור סדיר ועקבי מאוד' };
    if (stdDev <= 4.0) return { tag: 'regular', label: 'מחזור סדיר תקין' };
    return { tag: 'variable', label: 'מחזור בעל שונות משתנה' };
}

/** הפלגות (§4.2): הפרש ימים הלכתי (כולל שני הקצוות) בין כל שתי ראיות עוקבות. */
function buildGaps(reiyot) {
    const sorted = reiyot.slice().sort((a, b) => a.abs - b.abs);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
        gaps.push({
            abs: sorted[i].abs,
            span: sorted[i].abs - sorted[i - 1].abs + 1,
            natural: isNaturalSighting(sorted[i]) && isNaturalSighting(sorted[i - 1]),
            isPillCycle: sorted[i].kind === 'pills' || sorted[i - 1].kind === 'pills'
        });
    }
    return gaps;
}

/**
 * שבעה נקיים וטבילה — גזירה מקומית ופשוטה (§4.2 סעיף 3), מקבילה במכוון
 * (ולא זהה) ללוגיקה המלאה ב-`js/calculations.js` — ראו הערת המודול לעיל.
 */
function nekiimAndTevilahStats(absDays, db) {
    const hefsekim = absDays.filter(a => db[a] && db[a].type === 'hefsek');
    if (hefsekim.length === 0) return { successRate: null, averageDaysToTevilah: null };

    let successCount = 0;
    const daysToTevilah = [];
    hefsekim.forEach(hefsekAbs => {
        const interrupted = absDays.some(a =>
            db[a] && (db[a].type === 'reiyah' || db[a].type === 'hefsek') &&
            a > hefsekAbs && a <= hefsekAbs + 7);
        if (interrupted) return;
        successCount++;

        const expected = hefsekAbs + 7;
        const nextInterrupt = absDays.find(a =>
            db[a] && (db[a].type === 'reiyah' || db[a].type === 'hefsek') && a > expected);
        const manual = absDays.find(a =>
            db[a] && db[a].type === 'tevilah' && a > hefsekAbs && (!nextInterrupt || a < nextInterrupt));
        const tevilahAbs = (manual === undefined || manual <= expected) ? expected + 1 : manual;
        daysToTevilah.push(tevilahAbs - hefsekAbs);
    });

    return {
        successRate: Math.round((successCount / hefsekim.length) * 100),
        averageDaysToTevilah: daysToTevilah.length ? mean(daysToTevilah) : null
    };
}

/** יום ההפסק (נספר מיום הראייה כיום 1) לכל ראייה שאחריה הפסק לפני הראייה הבאה. */
function hefsekDayNumbers(reiyot, absDays, db) {
    const sorted = reiyot.slice().sort((a, b) => a.abs - b.abs);
    const out = [];
    sorted.forEach((r, i) => {
        const nextReiyahAbs = i + 1 < sorted.length ? sorted[i + 1].abs : Infinity;
        const hefsekAbs = absDays.find(a =>
            db[a] && db[a].type === 'hefsek' && a > r.abs && a < nextReiyahAbs);
        if (hefsekAbs !== undefined) out.push(hefsekAbs - r.abs + 1);
    });
    return out;
}

function signFrequencies(reiyot) {
    const counts = new Map();
    reiyot.forEach(r => (r.signs || []).forEach(code => counts.set(code, (counts.get(code) || 0) + 1)));
    return Array.from(counts.entries())
        .map(([code, count]) => ({ code, label: bodySignLabel(code), count }))
        .sort((a, b) => b.count - a.count);
}

/** התרעת קביעות: מיחוש שחזר על עצמו ב-2 הראיות האחרונות ברציפות (§4.2 סעיף 5). */
function signRepeatAlert(reiyot) {
    const sorted = reiyot.slice().sort((a, b) => a.abs - b.abs);
    if (sorted.length < 2) return null;
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const shared = (last.signs || []).filter(code => (prev.signs || []).indexOf(code) !== -1);
    if (shared.length === 0) return null;
    const label = bodySignLabel(shared[0]);
    return `שימי לב: מיחוש "${label}" הופיע ב-2 הראיות האחרונות. ראייה נוספת עם מיחוש זה עשויה לקבוע וסת הגוף.`;
}

/**
 * מנתחת את נתוני היומן ומפיקה מדדים סטטיסטיים (§4.2, §4.6).
 *
 * @param {Object} db - מסד הנתונים
 * @param {Object} [options]
 * @param {number[]} [options.excludedAbs] - הפלגות (abs הראייה המאוחרת) שהמשתמשת
 *   סימנה במפורש כ"החרג מחישוב הממוצע", גם אם לא זוהו אוטומטית כחריגות.
 * @param {number[]} [options.includedAbs] - הפלגות שזוהו אוטומטית כחריגות (§4.6),
 *   אך המשתמשת ביקשה במפורש לכלול אותן בכל זאת (ביטול ברירת המחדל של ההחרגה).
 * @returns {Object} InsightsResult
 */
export function calculateCycleInsights(db, options = {}) {
    const manualExcluded = new Set(options.excludedAbs || []);
    const manualIncluded = new Set(options.includedAbs || []);
    const absDays = Object.keys(db || {}).map(Number).sort((a, b) => a - b);
    const reiyot = buildReiyotFromDb(db);
    const naturalReiyot = reiyot.filter(isNaturalSighting);

    const hasEnoughData = reiyot.length >= 2;
    if (!hasEnoughData) {
        return {
            hasEnoughData: false,
            totalSightings: reiyot.length,
            cycleStats: { average: null, median: null, min: null, max: null, stdDev: null, stabilityTag: null, stabilityLabel: null },
            bleedStats: { averageDuration: null, modeHefsekDay: null },
            nekiimStats: { averageDaysToTevilah: null, successRate: null },
            seasonStats: { dayPercent: null, nightPercent: null, modeWeekday: null },
            signStats: { frequencies: [], repeatAlert: null },
            outliers: [],
            cyclesList: []
        };
    }

    const allGaps = buildGaps(reiyot);
    const naturalGaps = allGaps.filter(g => g.natural);

    // זיהוי חריגים (§4.6): מעל 3 סטיות תקן מן הממוצע הגולמי, או מעל 60 יום.
    const rawSpans = naturalGaps.map(g => g.span);
    const rawAvg = mean(rawSpans);
    const rawStd = populationStdDev(rawSpans, rawAvg);
    const outlierAbsSet = new Set();
    naturalGaps.forEach(g => {
        const isStatOutlier = g.span > OUTLIER_ABSOLUTE_DAYS ||
            (rawStd !== null && rawStd > 0 && g.span > rawAvg + OUTLIER_STDDEV_FACTOR * rawStd);
        if (isStatOutlier) outlierAbsSet.add(g.abs);
    });

    // ממוצע/חציון/טווח/סטיית תקן: הפלגה שזוהתה כחריגה מוחרגת **כברירת מחדל**
    // (תיבת הסימון באפיון מוצעת מסומנת, `[✔]`) — אלא אם המשתמשת ביטלה זאת
    // במפורש (`includedAbs`); וכן מוחרגת כל הפלגה שסומנה ידנית (`excludedAbs`),
    // גם אם לא זוהתה אוטומטית. החציון מגן באופן מובנה בכל מקרה.
    const usedGaps = naturalGaps.filter(g => {
        if (manualIncluded.has(g.abs)) return true;
        if (manualExcluded.has(g.abs)) return false;
        return !outlierAbsSet.has(g.abs);
    });
    const usedSpans = usedGaps.map(g => g.span);
    const avg = mean(usedSpans);
    const med = median(usedSpans);
    const stdDev = populationStdDev(usedSpans, avg);
    const stability = stabilityOf(stdDev);

    const hefsekDays = hefsekDayNumbers(naturalReiyot, absDays, db);
    const nekiim = nekiimAndTevilahStats(absDays, db);

    const dayCount = naturalReiyot.filter(r => r.ona === 'day').length;
    const nightCount = naturalReiyot.filter(r => r.ona === 'night').length;
    const seasonTotal = dayCount + nightCount;
    const weekdayModeIndex = seasonTotal
        ? mode(naturalReiyot.map(r => r.hdate.greg().getDay()))
        : null;

    const cyclesList = allGaps.slice(-MAX_CYCLES_SHOWN).map(g => {
        const r = reiyot.find(x => x.abs === g.abs);
        return {
            abs: g.abs,
            hdateStr: r.hdate.renderGematriya(),
            gregStr: r.hdate.greg().toLocaleDateString('he-IL'),
            ona: r.ona,
            haflagah: g.span,
            isOutlier: outlierAbsSet.has(g.abs),
            isExcluded: g.natural && !usedGaps.includes(g),
            isPillCycle: g.isPillCycle,
            isNatural: g.natural
        };
    });

    return {
        hasEnoughData: true,
        totalSightings: reiyot.length,
        cycleStats: {
            average: avg !== null ? Math.round(avg * 10) / 10 : null,
            median: med,
            min: usedSpans.length ? Math.min(...usedSpans) : null,
            max: usedSpans.length ? Math.max(...usedSpans) : null,
            stdDev: stdDev !== null ? Math.round(stdDev * 10) / 10 : null,
            stabilityTag: stability.tag,
            stabilityLabel: stability.label
        },
        bleedStats: {
            averageDuration: hefsekDays.length ? Math.round(mean(hefsekDays) * 10) / 10 : null,
            modeHefsekDay: mode(hefsekDays)
        },
        nekiimStats: nekiim,
        seasonStats: {
            dayPercent: seasonTotal ? Math.round((dayCount / seasonTotal) * 100) : null,
            nightPercent: seasonTotal ? Math.round((nightCount / seasonTotal) * 100) : null,
            modeWeekday: weekdayModeIndex !== null ? WEEKDAY_NAMES[weekdayModeIndex] : null
        },
        signStats: {
            frequencies: signFrequencies(naturalReiyot),
            repeatAlert: signRepeatAlert(naturalReiyot)
        },
        outliers: naturalGaps.filter(g => outlierAbsSet.has(g.abs)).map(g => ({ abs: g.abs, haflagah: g.span })),
        cyclesList
    };
}

/**
 * מפיק מחרוזת SVG טהורה של גרף המגמות (§4.3) — ללא ספריות חיצוניות.
 *
 * @param {Array} cyclesList - רשימת המחזורים האחרונים (`InsightsResult.cyclesList`)
 * @param {Object} [options]
 * @param {number} [options.width=700]
 * @param {number} [options.height=280]
 * @param {number} [options.averageLine] - קו הממוצע האישי (מקווקו ירוק), אם ידוע
 * @param {number} [options.referenceLine=30] - קו הייחוס הקבוע (מקווקו אדום)
 * @returns {string} תגית `<svg>...</svg>`
 */
export function renderTrendGraphSVG(cyclesList, options = {}) {
    const width = options.width || 700;
    const height = options.height || 280;
    const marginTop = 16;
    const marginBottom = 36;
    const marginSide = 24;
    const referenceLine = Number.isFinite(options.referenceLine) ? options.referenceLine : 30;
    const list = Array.isArray(cyclesList) ? cyclesList : [];

    if (list.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    }

    const spans = list.map(c => c.haflagah);
    const yMin = Math.min(20, Math.min(...spans) - 2);
    const yMax = Math.max(45, Math.max(...spans) + 2);
    const chartHeight = height - marginTop - marginBottom;
    const chartWidth = width - marginSide * 2;
    const barSlot = chartWidth / list.length;
    const barWidth = Math.max(4, barSlot * 0.6);

    const yToSvg = (value) => marginTop + chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;

    const bars = list.map((c, i) => {
        const x = marginSide + i * barSlot + (barSlot - barWidth) / 2;
        const yTop = yToSvg(c.haflagah);
        const barHeight = Math.max(1, (marginTop + chartHeight) - yTop);
        const fill = c.isPillCycle ? 'var(--text-muted)' : (c.isOutlier ? 'var(--orange)' : 'var(--primary)');
        const dash = c.isPillCycle ? ' stroke-dasharray="3,2" stroke="var(--text-muted)" stroke-width="1"' : '';
        const tooltip = `${c.hdateStr} (${c.gregStr}) — ${c.ona === 'night' ? 'עונת לילה' : 'עונת יום'} — הפלגה ${c.haflagah} ימים`
            + (c.isPillCycle ? ' — מחזור בתקופת כדורים' : '') + (c.isOutlier ? ' — הפלגה חריגה' : '');
        return `<rect data-idx="${i}" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" `
            + `height="${barHeight.toFixed(1)}" rx="3" fill="${fill}"${dash}><title>${tooltip}</title></rect>`;
    }).join('');

    const labels = list.map((c, i) => {
        const x = marginSide + i * barSlot + barSlot / 2;
        const label = c.hdateStr.split(' ').slice(0, 2).join(' ');
        return `<text x="${x.toFixed(1)}" y="${height - marginBottom + 14}" font-size="9" text-anchor="middle" `
            + `fill="var(--text-muted)">${label}</text>`;
    }).join('');

    const refY = yToSvg(referenceLine);
    const referenceLineSvg = referenceLine >= yMin && referenceLine <= yMax
        ? `<line x1="${marginSide}" y1="${refY.toFixed(1)}" x2="${width - marginSide}" y2="${refY.toFixed(1)}" `
            + `stroke="var(--red)" stroke-width="1.5" stroke-dasharray="6,4"></line>`
            + `<text x="${width - marginSide}" y="${(refY - 4).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--red)">${referenceLine}</text>`
        : '';

    let averageLineSvg = '';
    if (Number.isFinite(options.averageLine)) {
        const avgY = yToSvg(options.averageLine);
        if (options.averageLine >= yMin && options.averageLine <= yMax) {
            averageLineSvg = `<line x1="${marginSide}" y1="${avgY.toFixed(1)}" x2="${width - marginSide}" y2="${avgY.toFixed(1)}" `
                + `stroke="var(--green)" stroke-width="1.5" stroke-dasharray="2,3"></line>`
                + `<text x="${marginSide}" y="${(avgY - 4).toFixed(1)}" font-size="9" text-anchor="start" fill="var(--green)">ממוצע</text>`;
        }
    }

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" `
        + `aria-label="גרף מגמות אורך מחזור">`
        + `${referenceLineSvg}${averageLineSvg}${bars}${labels}`
        + `</svg>`;
}
