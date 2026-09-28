/**
 * Integrity / "no holes" test suite.
 *
 * 1. Static: every named import resolves to a real export in the target module.
 * 2. Static: every ipcRenderer.invoke channel in preload.js has an ipcMain.handle.
 * 3. Static: every getElementById('<id>') used in js/*.js exists in index.html.
 * 4. Static: every function called from an onclick/onchange attribute exists.
 * 5. Dynamic: full month-year sweep of the engine against an independent
 *    day-stepping derivation (no month-number logic reused from the engine).
 *
 * Run: node tests/integrity.test.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HDate } from '../hebcal.js';
import { calculateEngine, getMonthsInYear } from '../js/calculations.js';
import { HELP_TOPICS } from '../js/halachaHelp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const fail = (msg, detail) => {
    failures++;
    console.error('FAIL: ' + msg + (detail ? '\n      ' + detail : ''));
};
const pass = (msg) => console.log('PASS: ' + msg);

const jsFiles = ['js/app.js', 'js/ui.js', 'js/storage.js', 'js/security.js',
    'js/calculations.js', 'js/chazaka.js', 'js/akira.js', 'js/lifeState.js', 'js/silekReturn.js',
    'js/pillPause.js', 'js/vesetGuf.js', 'js/reiyaDuration.js',
    'js/vesetDilug.js', 'js/stringencies.js',
    'js/notifications.js', 'js/icons.js', 'js/googleBackup.js', 'js/halachaHelp.js'];
const sources = Object.fromEntries(jsFiles.map(f => [f, read(f)]));
const indexHtml = read('index.html');
const mainJs = read('main.js');
const preloadJs = read('preload.js');

// ---------- 1. Imports resolve to real exports ----------
function exportsOf(file) {
    const src = sources[file];
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop().trim();
            if (name) names.add(name);
        }
    }
    return names;
}

const exportCache = {};
function getExports(spec) {
    const target = spec.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const candidates = [target, 'js/' + target];
    for (const c of candidates) {
        if (sources[c]) {
            if (!exportCache[c]) exportCache[c] = exportsOf(c);
            return exportCache[c];
        }
    }
    return null; // hebcal.js and other non-scanned modules
}

let importCount = 0;
for (const file of jsFiles) {
    for (const m of sources[file].matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const spec = m[2];
        const exports = getExports(spec);
        if (!exports) continue;
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (!name) continue;
            importCount++;
            if (!exports.has(name)) {
                fail(`${file} imports missing export "${name}" from ${spec}`);
            }
        }
    }
}
pass(`all ${importCount} named imports resolve to real exports`);

// ---------- 2. IPC channels match ----------
const handlers = new Set([...mainJs.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
const sends = new Set([...mainJs.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
const invokes = new Set([...preloadJs.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
const listens = new Set([...preloadJs.matchAll(/ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
let ipcBad = 0;
for (const ch of invokes) if (!handlers.has(ch)) { fail(`preload invokes channel with no handler: ${ch}`); ipcBad++; }
for (const ch of sends) if (!listens.has(ch)) { fail(`main sends channel with no preload listener: ${ch}`); ipcBad++; }
if (ipcBad === 0) pass(`IPC channels match (${invokes.size} invoke, ${sends.size} send)`);

// ---------- 3. getElementById targets exist in index.html ----------
const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const missingIds = new Set();
for (const file of jsFiles) {
    for (const m of sources[file].matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
        if (!htmlIds.has(m[1])) missingIds.add(`${file}: ${m[1]}`);
    }
}
if (missingIds.size === 0) {
    pass('every getElementById id exists in index.html');
} else {
    for (const miss of missingIds) fail(`getElementById target not found in index.html -> ${miss}`);
}

// ---------- 4. Inline handlers point at defined functions ----------
const definedGlobals = new Set();
const allJs = jsFiles.map(f => sources[f]).join('\n');
for (const m of allJs.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) definedGlobals.add(m[1]);
for (const m of allJs.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) definedGlobals.add(m[1]);
for (const m of allJs.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g)) definedGlobals.add(m[1]);

const builtins = new Set(['document', 'window', 'alert', 'confirm', 'parseInt', 'parseFloat', 'Number', 'String',
    'return', 'if', 'let', 'const', 'function', 'this']);
const calledNames = new Set();
for (const m of indexHtml.matchAll(/on(?:click|change|input)=\"([^\"]+)\"/g)) {
    const body = m[1];
    // Match only bare function calls, not method calls like document.getElementById(...)
    for (const c of body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = c[2];
        if (builtins.has(name) || name.startsWith('this')) continue;
        calledNames.add(name);
    }
}
const unresolved = [...calledNames].filter(n => !definedGlobals.has(n));
if (unresolved.length === 0) {
    pass(`all ${calledNames.size} inline handlers resolve to defined functions`);
} else {
    for (const n of unresolved) fail(`inline handler calls undefined function: ${n}()`);
}

// ---------- 4b. Halachic help content is complete and wired ----------
const topicIds = new Set(HELP_TOPICS.map(t => t.id));
let helpProblems = 0;

if (topicIds.size !== HELP_TOPICS.length) {
    fail('help topics contain duplicate ids');
    helpProblems++;
}
for (const topic of HELP_TOPICS) {
    if (!topic.title || !topic.category || !topic.summary) {
        fail(`help topic "${topic.id}" is missing a title, category or summary`);
        helpProblems++;
    }
    if (!Array.isArray(topic.body) || topic.body.length === 0) {
        fail(`help topic "${topic.id}" has no explanation body`);
        helpProblems++;
    }
    // The whole point is source-backed explanation: a topic without sources is
    // an unsupported claim, so treat it as a failure rather than a warning.
    if (!Array.isArray(topic.sources) || topic.sources.length === 0) {
        fail(`help topic "${topic.id}" cites no sources`);
        helpProblems++;
    }
    // Non-Hebrew characters inside user-facing prose are almost always a typo
    // that slipped in (and one such typo reached a released build once).
    const foreign = /[A-Za-z\u0400-\u04FF\u0600-\u06FF]/;
    for (const text of [topic.title, topic.summary, ...(topic.body || []), ...(topic.points || [])]) {
        if (foreign.test(text)) {
            fail(`help topic "${topic.id}" contains non-Hebrew characters: ${text.slice(0, 60)}`);
            helpProblems++;
        }
    }
}
if (helpProblems === 0) pass(`all ${HELP_TOPICS.length} help topics are sourced and well formed`);

// Every data-help bubble in the markup must point at a real topic, otherwise
// the user clicks a "?" and nothing happens.
const bubbleTargets = [...indexHtml.matchAll(/data-help="([^"]+)"/g)].map(m => m[1]);
const orphanBubbles = bubbleTargets.filter(id => !topicIds.has(id));
if (orphanBubbles.length === 0) {
    pass(`all ${bubbleTargets.length} info bubbles point at an existing help topic`);
} else {
    for (const id of orphanBubbles) fail(`info bubble points at an unknown help topic: ${id}`);
}

// ---------- 5. Independent full-sweep verification of the engine ----------

/** Absolute day of the first day of the Hebrew month FOLLOWING the month of `abs`. */
function monthStartAfter(abs) {
    const baseMonth = new HDate(abs).getMonth();
    let k = 1;
    while (new HDate(abs + k).getMonth() === baseMonth) {
        k++;
        if (k > 40) throw new Error('month walk failed');
    }
    return abs + k;
}

/**
 * Independently derived expectation, using only day-stepping (no month maths).
 * Returns { single: abs } for the normal case, or { disputed: [abs, ...] }
 * when the day is missing in the next month.
 *
 * The disputed case carries THREE candidate dates (`docs/SPEC_DINIM_VESATOT.md`
 * §2.1.1, §9.3): the last day of the short month, the 30th of the first later
 * month with 30 days, and the 1st of the following month ("בתורת ראש חודש"
 * `[ד"ט | עמ' 4]`).
 */
function expectedYomHachodesh(baseAbs, dayOfMonth) {
    const nextStart = monthStartAfter(baseAbs);
    const nextLen = monthStartAfter(nextStart) - nextStart;
    if (dayOfMonth <= nextLen) {
        return { single: nextStart + (dayOfMonth - 1), disputed: null };
    }
    // Disputed: last day of the short month, the 30th of the first later month with
    // 30 days, and the 1st of the following month.
    const shortLast = nextStart + nextLen - 1;
    let mStart = nextStart;
    let later30 = null;
    for (let i = 0; i < 6; i++) {
        const len = monthStartAfter(mStart) - mStart;
        if (len === 30) { later30 = mStart + 29; break; }
        mStart = monthStartAfter(mStart);
    }
    const disputed = [shortLast, nextStart];  // כ"ט של החודש החסר + א' של החודש הבא
    if (later30 !== null) disputed.push(later30);
    disputed.sort((a, b) => a - b);
    return { single: null, disputed };
}

let swept = 0;
let sweepsFailed = 0;
for (let year = 5780; year <= 5795; year++) { // spans 5 leap years
    const months = getMonthsInYear(year);
    for (let month = 1; month <= months; month++) {
        const monthDays = HDate.daysInMonth(month, year);
        // First, middle and last day of every month: covers every month boundary
        // and the 30 -> 29 / 30 -> 30 successor cases.
        for (const day of [1, 15, monthDays]) {
            const baseAbs = new HDate(day, month, year).abs();
            const { computed } = calculateEngine({ [baseAbs]: { type: 'reiyah', ona: 'day' } }, false);

            const absOf = (code) => Object.entries(computed.prishot)
                .filter(([, list]) => list.some(p => p.code === code))
                .map(([abs]) => Number(abs))
                .sort((a, b) => a - b);
            const plainYh = absOf('יו"ח');
            const disputedYh = absOf('יו"ח*');
            const exp = expectedYomHachodesh(baseAbs, day);

            if (exp.single !== null) {
                if (plainYh.length !== 1 || plainYh[0] !== exp.single || disputedYh.length > 0) {
                    fail(`yom hachodesh mismatch for (${day},${month},${year}): expected single abs ${exp.single}, got plain [${plainYh.join(',')}] disputed [${disputedYh.join(',')}]`);
                    sweepsFailed++;
                }
            } else {
                const want = exp.disputed.slice().sort((a, b) => a - b);
                if (JSON.stringify(disputedYh) !== JSON.stringify(want) || plainYh.length > 0) {
                    fail(`disputed yom hachodesh mismatch for (${day},${month},${year}): expected [${want.join(',')}], got [${disputedYh.join(',')}] (plain: [${plainYh.join(',')}])`);
                    sweepsFailed++;
                }
            }

            // Beinonit must be exactly abs+29 and abs+30
            const hasBeinonit = (abs, code) => (computed.prishot[abs] || []).some(p => p.code === code);
            if (!hasBeinonit(baseAbs + 29, 'עו"ב') || !hasBeinonit(baseAbs + 30, 'עו"ל')) {
                fail(`missing beinonit day-30/day-31 for (${day},${month},${year})`);
                sweepsFailed++;
            }

            // No prishah may land before the reiyah that generated it
            for (const abs of Object.keys(computed.prishot)) {
                if (Number(abs) <= baseAbs) {
                    fail(`prishah computed in the past for (${day},${month},${year}): abs ${abs}`);
                    sweepsFailed++;
                }
            }
            swept++;
        }
    }
}
if (sweepsFailed === 0) pass(`engine sweep over ${swept} dates (16 Hebrew years incl. leap years) is consistent with independent derivation`);

// ---------- Summary ----------
if (failures > 0) {
    console.error(`\n${failures} integrity problem(s) found.`);
    process.exit(1);
} else {
    console.log('\nAll integrity checks passed.');
}
