/**
 * וסת הגוף ווסת המורכב (יום + מיחוש).
 *
 * `js/chazaka.js` מזהה וסת קבוע של **ימים** (חודש / הפלגה). המודול הזה עונה על
 * השאלה האחרת: **מיחוש גופני** שתועד על ראייה — מתי הוא אוסר, מתי הוא קובע וסת,
 * ומתי הוא מתחבר לימים ל"וסת מורכב".
 *
 * ## המקורות שאומתו בגוף הספר ובדעת טהרה
 *
 *  - **רשימת המיחושים:** "ואלו הן הוסתות, מפהקת ומעטשת וחוששת בפי כריסה ובשפולי
 *    מעיה ושופעת וכמין צמרמורות אוחזין אותה וכן כיוצא בהן, **וכל שקבעה לה שלשה
 *    פעמים הרי זה וסת**" `[שט ל"ט | עמ' 158]`; ושם: "**משעה שבאו המיחושים אסורה
 *    כדין שעת הוסת**", וכן "אם אירע כן שלש פעמים שהרגישה המיחושים וראתה, הרי הוא
 *    וסת קבוע. ואם אירע כן **פעם אחת חוששת לו כדין וסת שאינו קבוע**" `[שט ל"ט | עמ' 158]`.
 *  - **התנאי המגביל — שלא יסומן מיחוש שגרתי:** "דוסת הגוף הוא דוקא במיחוש כזה
 *    **שאינו דבר שבשיגרה אלא שהוא משונה ומוכח שהוא שייך לביאת הוסת**... והוא הדין
 *    לשאר מיחושים שאין להם דין וסת הגוף אלא אם כן הם באופן שאינו שגרתי ורגיל"
 *    `[שט ל"ט | עמ' 158]`. ומדעת טהרה: "**ודוקא שיודעת בבירור שמיחוש זה קשור
 *    לראיית הדם**" `[ד"ט | עמ' 11]`.
 *  - **הרחבת רשימת הסימנים:** "הראב"ד הוסיף מה שמצוי בזמנינו שמתעוררת להקיא קודם
 *    ביאת הוסת... וכן מה שמצוי בזמנינו שמרגשת **חולשה** או שיש לה **פצעים בפניה**
 *    קודם ביאת הוסת, כל אלו חשיבי וסת הגוף... וכן הוא להלכה, שכל דבר שקרה לה כמה
 *    פעמים ואחר כך ראתה דם, יש לו דין וסת הגוף" `[שט ל"ט | עמ' 159]`.
 *  - **חומרת הבדיקה:** "**ולהלכה קיימא לן כדעת הט"ז, שבוסת הגוף אף כשאינו קבוע
 *    ועבר הוסת ולא ראתה אסורה עד שתבדוק**, דכיון שיש ריעותא לפנינו יש להחמיר בזה
 *    כמו בוסת הקבוע" `[שט ל"ט | עמ' 160]` (הש"ך בנקודות הכסף חולק — ראו להלן).
 *  - **וסת שאינו קבוע שבגוף:** "אשה שפיהקה פעם אחת וראתה וכן הדין אם אירע כן שתי
 *    פעמים... ולכך **כשתפהק בפעם אחר אפילו ביום אחר חוששת לו כדין וסת**, ואם
 *    [לא] בלי פיהוק... והגר"ז ס"ק צ' כתב שחוששת גם לעונה בינונית" `[שט ל"ט | עמ' 160]`.
 *  - **וסת המורכב — הסברא:** "ואם בא וסת הגוף לזמן ידוע, כגון מראש חודש לראש חודש
 *    או מעשרים יום לעשרים יום, **קבעה לה וסת לזמן ולמיחוש הוסת**" `[שט ל"ט | עמ' 160]`.
 *  - **וסת המורכב — קביעותו בג' ראיות רצופות דוקא:** "שמה שקובעת וסת המורכב הוא
 *    דוקא **כשראתה שלש ראיות רצופות באופן זה של היום והקפיצה**, אבל אם ראתה בנתיים
 *    ביום הוסת בלא קפיצה, **לא קבעה וסת לימים ולקפיצות**" `[שט מ' | עמ' 180]`
 *    (הראב"ד בבעלי הנפש), ומובא גם הגר"ז. ולאחר שנקבע — "במה שתראה ביום הוסת בלי
 *    קפיצה **לא נעקר הוסת**" `[שט מ' | עמ' 180]`.
 *  - **החשש בוסת המורכב — ביום עצמו, אף קודם המיחוש:** "בוסת המורכב מוסת הימים
 *    ווסת הגוף, **שצריכה לחשוש באותו היום אף קודם שבא המיחוש** כמבואר בשו"ע סי'
 *    קפ"ט סכ"ה, **אך לעונת האור זרוע אין צריכה לחשוש אם עדיין לא בא המיחוש**"
 *    `[שט כ"ז | עמ' 49]`.
 *  - **וסת מורכב להפלגה — הראייה הראשונה צריכה להיות במיחוש:** "והיה נראה בפשטות
 *    שאם ראתה פעם אחת בלי פיהוק ואחר כך שלש פעמים בהפלגות שוות ובפיהוק, דקבעה לה
 *    וסת להפלגה ופיהוק... **אבל הסוגה בשושנים כתב דגם הראיה הראשונה צריכה להיות
 *    בפיהוק**" `[שט ל"ט | עמ' 161]`.
 *  - **עונה בינונית — מחלוקת:** הש"ך: "דדוקא אם יש לה וסת הגוף שאינו קבוע לזמן
 *    חוששת לעונה בינונית... אבל בוסת המורכב לימים ולקפיצות, כיון שאף אם יבוא יום
 *    הוסת לא תראה אם לא תקפוץ, **צריכה לחשוש לעונה בינונית**" `[שט ל"ט | עמ' 165]`;
 *    והחוות דעת מחלק — ולכן הדבר מוצג כמחלוקת ואינו מכריע **בשקט** (העיקרון המנחה
 *    של הפרויקט: אין מסירים חשש על דעתנו).
 *  - **מיחוש שבא בלא עיתו:** "וכל מי שרגילה לראות עם המיחוש צריכה לחשוש שהוא סימן
 *    שבא הוסת **ואף על פי שבא בלא עתו**, וכן יש להחמיר למעשה" `[שט ל"ט | עמ' 165]`.
 *
 * ## הכרעות המימוש (מפורטות ב-`docs/DECISIONS.md`)
 *
 *  1. **ג' פעמים לאותו מיחוש ⇒ וסת קבוע; פעם אחת או שתיים ⇒ דין וסת שאינו קבוע**
 *     `[שט ל"ט | עמ' 158]`, `[שט ל"ט | עמ' 160]`. היחידים שסוברים שסימני המשנה
 *     קובעים בפעם אחת מוצגים כמחלוקת, ולא מכריעים אותה בשקט `[שט ל"ט | עמ' 161]`.
 *  2. **הווסת המורכב נקבע רק בג' ראיות רצופות** שבהן גם היום וגם המיחוש — כדעת
 *     הראב"ד `[שט מ' | עמ' 180]`; ולכן הוא **אינו** נקבע ב"תבנית שנשלמה" אם בנתיים
 *     ראתה ביום הוסת בלי המיחוש.
 *  3. **הווסת המורכב אינו מבטל את שאר החששות** (ואינו נכנס ל-`standingVesets`):
 *     "צריכה לחשוש לעונה בינונית" `[שט ל"ט | עמ' 165]`, ולכן הוא **מוסיף** סימון ביום
 *     הוסת ואינו מסיר דבר.
 *  4. **אין עונת אור זרוע לפני היום המורכב** — "לעונת האור זרוע אין צריכה לחשוש אם
 *     עדיין לא בא המיחוש" `[שט כ"ז | עמ' 49]`.
 *  5. **המיחוש הוא קלט שהמשתמשת מעידה עליו** — גם על היותו משונה וגם על קישורו
 *     לראייה. המנוע אינו מסיק אותו מדיווח אחר.
 */

/** מיחושי וסת הגוף, כפי שהם מוצגים למשתמשת. */
export const BODY_SIGNS = [
    { code: 'yawn', label: 'פיהוק', classic: true },
    { code: 'sneeze', label: 'עיטוש', classic: true },
    { code: 'cramps', label: 'כאבים בפי כריסה ובשפולי מעיה (צירי הקדחות)', classic: true },
    { code: 'heaviness', label: 'כובד ראש ואיברים', classic: true },
    { code: 'chills', label: 'צמרמורות', classic: true },
    { code: 'blood', label: 'שופעת דם טמא מתוך דם טהור', classic: true },
    { code: 'nausea', label: 'בחילה או הקאה', classic: false },
    { code: 'weakness', label: 'חולשה', classic: false },
    { code: 'faceSpots', label: 'פצעים בפנים', classic: false },
    // A6 — **אכילת דברים חריפים** ("בפעם אחת"): "מבואר בהשגות בעל המאור על בעלי הנפש
    // דקפיצות נחשב אונס... אבל **אכילת דברים חריפים שאוכלת מדעתה ולהנאתה אין זה נקרא
    // אונס ולכן קובעת וסת למקרים אלו כמו וסת הגוף**" `[שט כ"ז | עמ' 41]`.
    //
    // ולכן היא נרשמת באותו מסלול של וסת הגוף — יום של "מקרה" שגרם לראייה — ומכאן:
    // (א) היא נספרת לחזקה (ג' פעמים = וסת קבועה); (ב) החשש נוהג **גם בפעם אחת**,
    // כדין וסת הגוף ("פעם אחת או שתיים — חוששת לו כדין וסת שאינו קבוע");
    // (ג) והיא **אינה** נחשבת כוסת האונס (שאינה נספרת לחזקה).
    { code: 'sharpFood', label: 'אכילת דברים חריפים (מאכל חריף)', classic: false, cause: 'food' },
    { code: 'other', label: 'מיחוש אחר, משונה וקשור לראייה', classic: false }
];

const SIGN_BY_CODE = BODY_SIGNS.reduce((acc, s) => {
    acc[s.code] = s;
    return acc;
}, {});

/** תווית המיחוש לפי הקוד; קוד שאינו מוכר מוחזר כמות שהוא ולא נעלם. */
export function bodySignLabel(code) {
    return SIGN_BY_CODE[code] ? SIGN_BY_CODE[code].label : String(code);
}

/** האם המיחוש נמנה עם אלו המנויים במשנה (סימנים "מוכחים"). */
export function isClassicSign(code) {
    return !!(SIGN_BY_CODE[code] && SIGN_BY_CODE[code].classic);
}

/** סימון החשש של הווסת המורכב על יום החודש. */
export const COMPOUND_MONTH_CODE = 'ומ"ח';
/** סימון החשש של הווסת המורכב על ההפלגה. */
export const COMPOUND_HAFLAGAH_CODE = 'ומ"ה';

/** ג' פעמים לאותו מיחוש — וסת קבוע `[שט ל"ט | עמ' 158]`. */
export const BODY_FIXED_COUNT = 3;

/** וסת מורכב לימים נקבע בג' ראיות רצופות של היום והמיחוש `[שט מ' | עמ' 180]`. */
export const COMPOUND_MONTH_SIGHTINGS = 3;

/** וסת מורכב להפלגה — ד' ראיות, שכולן במיחוש (הראשונה שבה נמנית) `[שט ל"ט | עמ' 161]`. */
export const COMPOUND_HAFLAGAH_SIGHTINGS = 4;

/**
 * ניסוחי הדין, לשימוש הממשק. כל רשומה נושאת את מראה המקום שלה, כדי שהמשתמשת
 * תדע **מאין** בא כל חשש.
 */
export const BODY_VESET_RULES = {
    condition: {
        title: 'התנאי לסימון מיחוש',
        text: '\"דוסת הגוף הוא דוקא במיחוש כזה שאינו דבר שבשיגרה אלא שהוא משונה ומוכח שהוא שייך '
            + 'לביאת הוסת\". ולכן אין לסמן מיחוש שבשיגרה, ורק מיחוש שהאשה יודעת בבירור שהוא '
            + 'קשור לראייתה נחשב.',
        source: '[שט ל\'ט | עמ\' 158] · [ד"ט | עמ\' 11]'
    },
    onSymptom: {
        title: 'עם הופעת המיחוש — אסורה כדין שעת הוסת',
        text: '\"משעה שבאו המיחושים אסורה כדין שעת הוסת\" — עוד לפני שראתה דם. ואם הראייה '
            + 'נמשכת אחר המיחוש, אסורה מעת שהתחיל המיחוש עד סוף אותה עונה.',
        source: '[שט ל\'ט | עמ\' 158] · [ד"ט | עמ\' 11]'
    },
    standalone: {
        title: 'מיחוש בלא ראייה',
        text: 'המיחוש עצמו אוסר: "משעה שבאו המיחושים אסורה כדין שעת הוסת" — ואף בלא שראתה. '
            + 'ולכן מיחוש שתועד בלא ראייה נמנה עם מיחושי וסת הגוף: הוא נספר לקביעות, '
            + 'ולאורכו נדרשת בדיקה כדין — ואם עבר ולא בדקה, אסורה עד שתבדוק.',
        source: '[שט ל\'ט | עמ\' 158] · [שט ל\"ט | עמ\' 160]'
    },
    notFixed: {
        title: 'מיחוש שתועד פעם אחת או שתיים',
        text: 'אשה שפיהקה פעם אחת וראתה — \"חוששת לו כדין וסת שאינו קבוע\", ולכן \"כשתפהק בפעם אחר '
            + 'אפילו ביום אחר חוששת לו כדין וסת\"; וכן חוששת שמא תקבע וסת למיחוש לבדו — ליום '
            + 'ולעונה בינונית.',
        source: '[שט ל\"ט | עמ\' 160]'
    },
    fixed: {
        title: 'וסת הגוף הקבועה',
        text: '\"כל שקבעה לה שלשה פעמים הרי זה וסת\" — ומשהגיע אותו מיחוש דינה כהגיע שעת וסתה. '
            + 'הוסת אינה תלויה בתאריך, אלא נקבעת למיחוש עצמו.',
        source: '[שט ל\'ט | עמ\' 158] · [ד"ט | עמ\' 11]'
    },
    checkStrictness: {
        title: 'עבר המיחוש ולא בדקה — אסורה עד שתבדוק',
        text: '\"להלכה קיימא לן כדעת הט\"ז, שבוסת הגוף אף כשאינו קבוע ועבר הוסת ולא ראתה אסורה עד '
            + 'שתבדוק, דכיון שיש ריעותא לפנינו יש להחמיר בזה כמו בוסת הקבוע\". הבודקת קודם '
            + 'המיחוש אינה מבררת שלא תפהק אחר כך.',
        source: '[שט ל\"ט | עמ\' 160]'
    },
    checkDispute: {
        title: 'מחלוקת — האם נדרשת בדיקה בוסת הגוף שאינו קבוע',
        text: 'הש"ך בנקודות הכסף חולק על הט"ז וסובר שאין חומרא בוסת הגוף יותר מבשאר וסתות. '
            + 'ברירת המחדל של האפליקציה כדעת הט"ז (מחמירה); מתג בהגדרות '
            + 'מאפשר לכבות זאת ולנהוג כדעת הש"ך.',
        source: '[שט ל\"ט | עמ\' 160]'
    },
    classicDispute: {
        title: 'מחלוקת — קביעות בפעם אחת בסימני המשנה',
        text: 'בגמרא מבואר שסימנים המנויים במשנה קובעים וסת בפעם אחת (דעת רבי), ולשאר מיחושים '
            + 'נדרשות שלש פעמים. האפליקציה נוקטת כדברי השו"ע: חשש בפעם אחת, וקביעות בג\' פעמים. '
            + 'מי שהחמירה בזה — יש לשאול רב.',
        source: '[שט ל\"ט | עמ\' 161] · [שט ל\'ט | עמ\' 158]'
    },
    compound: {
        title: 'וסת מורכב — יום ומיחוש',
        text: '\"ואם בא וסת הגוף לזמן ידוע, כגון מראש חודש לראש חודש או מעשרים יום לעשרים יום, '
            + 'קבעה לה וסת לזמן ולמיחוש הוסת\". וקביעותו דוקא \"כשראתה שלש ראיות רצופות באופן זה '
            + 'של היום והקפיצה\" — ואם ראתה בנתיים ביום הוסת בלא מיחוש, לא קבעה.',
        source: '[שט ל\"ט | עמ\' 160] · [שט מ\' | עמ\' 180]'
    },
    compoundDay: {
        title: 'היום לבדו — אף קודם שבא המיחוש',
        text: '\"בוסת המורכב מוסת הימים ווסת הגוף, שצריכה לחשוש באותו היום אף קודם שבא המיחוש\" — '
            + 'שמא בשעת תשמיש יבוא המיחוש ותראה.',
        source: '[שט כ"ז | עמ\' 49]'
    },
    compoundNoOrZarua: {
        title: 'אין עונת אור זרוע לוסת המורכב',
        text: '\"אך לעונת האור זרוע אין צריכה לחשוש אם עדיין לא בא המיחוש\" — ולכן אין האפליקציה '
            + 'מוסיפה את העונה שלפני היום המורכב.',
        source: '[שט כ"ז | עמ\' 49]'
    },
    compoundOnaBeinonit: {
        title: 'עונה בינונית בוסת מורכב — מחלוקת',
        text: 'הש"ך: בוסת המורכב לימים ולקפיצות \"צריכה לחשוש לעונה בינונית\", שהרי אף אם יבוא יום '
            + 'הוסת לא תראה אם לא תקפוץ; והחוות דעת מחלק בין מורכב למיחוש הקבוע לזמן. האפליקציה '
            + 'אינה מכריעה: היא ממשיכה להציג את עונה בינונית (מחמירה) ואינה מסירה חשש.',
        source: '[שט ל\"ט | עמ\' 165]'
    },
    signOffTime: {
        title: 'מיחוש שבא שלא בעונתו',
        text: '\"וכל מי שרגילה לראות עם המיחוש צריכה לחשוש שהוא סימן שבא הוסת ואף על פי שבא בלא '
            + 'עתו, וכן יש להחמיר למעשה\" — ולכן מיחוש שתועד סומן, אף אם לא חל ביום הוסת.',
        source: '[שט ל\"ט | עמ\' 165]'
    },
    dailyCheck: {
        title: 'הבדיקה הנדרשת בוסת הגוף',
        text: '\"להלכה קיימא לן כדעת הט\"ז, שבוסת הגוף אף כשאינו קבוע ועבר הוסת ולא ראתה אסורה עד '
            + 'שתבדוק, דכיון שיש ריעותא לפנינו יש להחמיר בזה כמו בוסת הקבוע\". והבדיקה שאינה '
            + 'מבררת היא קינוח לבד — \"הבדיקה המועילה לברר שלא ראתה היא כשבודקת כדין בעומק '
            + 'ובחו\"ס\" — ולכן התזכורת היומית נוקבת בבדיקה כדין.',
        source: '[שט ל\"ט | עמ\' 160] · [שט מ"א | עמ\' 182]'
    }
};

/** מזהה נושא העזרה של וסת הגוף — לתזכורת היומית ולסימון בלוח (מקור אחד). */
export const BODY_HELP_TOPIC = 'veset_haguf';

/**
 * דרגת הוודאות של מיחוש **בלא ראייה** (2026-09-20, בקשת המשתמש) — כמה בטוחה
 * היא שהמיחוש הזה מבשר ראייה מיידית. שדה עתידי בלבד: אינו נוגע כלל לקביעת
 * וסת הגוף עצמה (עדיין ג' פעמים לאותו מיחוש, בלי קשר לדרגה) — הוא קובע רק
 * את **חומרת התביעה של הרגע הזה**: `certain` (ברירת המחדל) שומר על ההתנהגות
 * הקיימת (אסורה מיד, ועד שתבדוק); `likely`/`vague` הן חדשות ומקילות.
 *
 * מקור: מסמכי "יסודות הבית" (מקור משני — לא אומת מול הספר הראשי "שיעורי
 * טהרה", ולכן אין כאן מראה מקום לספר עצמו).
 */
export const SIGN_CERTAINTY = {
    certain: { label: 'בטוחה שהוסת בא מיד', order: 0 },
    likely: { label: 'סביר שהוסת יבוא בין שעה ליממה', order: 1 },
    vague: { label: 'מיחוש רחוק / מסופק', order: 2 }
};

export const SIGN_CERTAINTY_DEFAULT = 'certain';

/** דרגת הוודאות התקנית — כל מה שאינו מוכר חוזר לברירת המחדל המחמירה. */
export function normalizeSignCertainty(value) {
    return SIGN_CERTAINTY[value] ? value : SIGN_CERTAINTY_DEFAULT;
}

/** האם לראייה זו סומן מיחוש גופני כלשהו. */
export function signsOf(reiya) {
    if (!reiya || !Array.isArray(reiya.signs)) return [];
    return reiya.signs.filter(code => typeof code === 'string' && code.length > 0);
}

export function hasSign(reiya, code) {
    return signsOf(reiya).indexOf(code) !== -1;
}

/**
 * הריצף האחרון (מן הסוף) של ראיות שנספרות, שכולן נושאות את אותו מיחוש ומקיימות תנאי נוסף.
 *
 * זו הצורה המדויקת של דרישת הראב"ד: "דוקא כשראתה שלש ראיות **רצופות** באופן זה של היום
 * והקפיצה, אבל אם ראתה **בנתיים** ביום הוסת בלא קפיצה, לא קבעה" `[שט מ' | עמ' 180]` —
 * ראייה שנספרת ואין בה המיחוש (או שאין בה אותו היום) קוטעת את הריצף.
 *
 * ונוסף על כך — תנאי העונה הכללי: "אין הוסת נקבע עד שיהיו כל הראיות באותה עונה"
 * `[ד"ט | עמ' 7]`, ולכן גם הוא נבדק כאן.
 *
 * @param {Array} list - הראיות שנספרות, בסדר כרונולוגי
 * @param {string} code - קוד המיחוש
 * @param {Function} matches - (reiya, previousInRun, runLength) => boolean
 * @returns {Array} הראיות שבריצף, בסדר כרונולוגי
 */
function trailingSignRun(list, code, matches) {
    const run = [];
    let previous = null;
    for (let i = list.length - 1; i >= 0; i--) {
        const reiya = list[i];
        if (!hasSign(reiya, code)) break;
        if (!matches(reiya, previous, run.length)) break;
        run.unshift(reiya);
        previous = reiya;
    }
    return run;
}

/**
 * האם הענף הזה של וסת המורכב מזוהה לפי **כל** הראיות שבריצף (לרבות הראשונה שבהן).
 *
 * לגבי וסת המורכב **להפלגה** — "הסוגה בשושנים" כתב שאף הראייה הראשונה צריכה להיות
 * במיחוש `[שט ל"ט | עמ' 161]`, וזו ההכרעה שננקטה כאן; הרי שהיא דורשת ריצף של ד' ראיות
 * שכולן במיחוש. המחלוקת מוצגת למשתמשת (ראו `notes`).
 *
 * @param {Array} list
 * @param {string} code
 * @returns {Array<{kind: string, sign: string, establishedBy: Array, ona: string, dayOfMonth?: number, span?: number, spanLabel?: number, lastAbs: number}>}
 */
function findCompoundVesets(list, code) {
    const out = [];
    if (!list.length) return out;

    // וסת מורכב ליום החודש: ג' ראיות רצופות, כולן עם המיחוש, באותו יום בחודש ובאותה עונה.
    const monthRun = trailingSignRun(list, code, (reiya, previous, runLength) =>
        runLength === 0 || (reiya.hdate.getDate() === previous.hdate.getDate()
            && reiya.ona === previous.ona));
    if (monthRun.length >= COMPOUND_MONTH_SIGHTINGS) {
        const last = monthRun[monthRun.length - 1];
        out.push({
            kind: 'month',
            sign: code,
            dayOfMonth: last.hdate.getDate(),
            ona: last.ona,
            lastAbs: last.abs,
            establishedBy: monthRun.slice(-COMPOUND_MONTH_SIGHTINGS).map(r => r.abs)
        });
    }

    // וסת מורכב להפלגה: ד' ראיות רצופות במיחוש, שג' ההפלגות שביניהן שוות.
    if (list.length >= 2) {
        const span = list[list.length - 1].abs - list[list.length - 2].abs;
        if (span > 0) {
            const hafRun = trailingSignRun(list, code, (reiya, previous, runLength) =>
                runLength === 0 || (previous.abs - reiya.abs === span
                    && reiya.ona === previous.ona));
            if (hafRun.length >= COMPOUND_HAFLAGAH_SIGHTINGS) {
                const last = hafRun[hafRun.length - 1];
                out.push({
                    kind: 'haflagah',
                    sign: code,
                    span,
                    spanLabel: span + 1, // מניין ההפלגה ההלכתי כולל את שני הקצוות
                    ona: last.ona,
                    lastAbs: last.abs,
                    // הראייה הראשונה אינה מן המניין לקביעות, אך היא נדרשת במיחוש.
                    establishedBy: hafRun.slice(-COMPOUND_HAFLAGAH_SIGHTINGS).map(r => r.abs)
                });
            }
        }
    }

    return out;
}

/**
 * מנתח את המיחושים שתועדו על הראיות.
 *
 * @param {Object} params
 * @param {Array} params.reiyot - כל הראיות (עם `hdate`, `ona`, `signs`)
 * @param {Array} [params.counted] - הראיות שנספרות לחזקה ממנוע החזקה (`js/chazaka.js`);
 *        בהיעדרו נספרות כל הראיות שאינן מחמת אונס.
 * @param {Array} [params.signRecords] - מיחושים שתועדו **בלא ראייה** (`type: 'sign'`
 *        ב-db): `{abs, ona, signs, checked}`. אלו נספרים לוסת הגוף, שהרי המיחוש עצמו
 *        אוסר — "משעה שבאו המיחושים אסורה כדין שעת הוסת" — אך אין להם יום בחודש
 *        או הפלגה, ולכן אין הם נבחנים לוסת המורכב.
 * @returns {{
 *   configured: boolean,
 *   bySign: Array,
 *   fixedBody: Array,
 *   pendingBody: Array,
 *   compound: Array,
 *   unauditedSigns: Array,
 *   standaloneSigns: Array,
 *   notes: Array<{level: string, title: string, text: string, source: string}>
 * }}
 */
export function analyzeBodyVeset({ reiyot, counted, signRecords }) {
    const empty = {
        configured: false, bySign: [], fixedBody: [], pendingBody: [],
        compound: [], unauditedSigns: [], standaloneSigns: [], notes: []
    };

    const all = (reiyot || []).slice().sort((a, b) => a.abs - b.abs);
    const withSigns = all.filter(r => signsOf(r).length > 0);

    // מיחוש בלא ראייה: יש לו תאריך ועונה, ולכן הוא נספר וניתן לתבוע עליו בדיקה.
    const standaloneSigns = (signRecords || [])
        .filter(r => signsOf(r).length > 0)
        .map(r => ({
            abs: r.abs,
            ona: r.ona || 'day',
            signs: signsOf(r),
            checked: r.checked === true,
            // דרגת ודאות (2026-09-20) — קובעת רק את חומרת התביעה, לא את הקביעות עצמה.
            certainty: normalizeSignCertainty(r.certainty)
        }))
        .sort((a, b) => a.abs - b.abs);
    if (withSigns.length === 0 && standaloneSigns.length === 0) return empty;

    // הרשימה הנספרת לוסת הגוף: הראיות שנספרות, ואליהן מיחושי המיחוש שבלא ראייה
    // (שאין להם ראייה, אך יש להם תאריך).
    const sightingList = (counted || all.filter(r => r.kind !== 'ones')).slice().sort((a, b) => a.abs - b.abs);
    const signOnlyList = standaloneSigns.map(s => ({
        abs: s.abs, ona: s.ona, signs: s.signs, standalone: true
    }));
    const list = sightingList.concat(signOnlyList).sort((a, b) => a.abs - b.abs);

    // מיחושים שתועדו על ראייה שאינה נספרת (אונס / המשך דימום): אינם יכולים לקבוע,
    // אך אינם נעלמים בשקט.
    const countedAbs = new Set(list.map(r => r.abs));
    const unauditedSigns = withSigns
        .filter(r => !countedAbs.has(r.abs))
        .map(r => ({
            abs: r.abs,
            signs: signsOf(r),
            reason: r.kind === 'ones'
                ? 'הראייה סומנה כמחמת אונס — אינה מן המניין, ולכן המיחוש אינו קובע וסת'
                : 'הראייה נמנית עם הראייה הקודמת (המשך דימום) — ולכן אין בה מיחוש נפרד הקובע וסת'
        }));

    const bySign = [];
    const compound = [];

    BODY_SIGNS.forEach(sign => {
        const sightings = list.filter(r => hasSign(r, sign.code));
        if (sightings.length === 0) return;

        const fixed = sightings.length >= BODY_FIXED_COUNT;
        bySign.push({
            code: sign.code,
            label: sign.label,
            classic: sign.classic,
            sightings: sightings.map(r => r.abs),
            count: sightings.length,
            fixed,
            ons: [...new Set(sightings.map(r => r.ona))],
            lastAbs: sightings[sightings.length - 1].abs
        });

        // וסת המורכב נבחן על **ראיות** בלבד: מיחוש בלא ראייה אין לו יום קביעות,
        // וצירוף של מיחושים בלא ראיות אינו עושה וסת מורכבת.
        findCompoundVesets(sightingList, sign.code).forEach(c => compound.push(
            Object.assign({ signLabel: sign.label }, c)
        ));
    });

    // מיחושים שנשמרו ב-db ואינם מוכרים עוד (למשל קוד שהוסר) — אינם נעלמים בשקט.
    const knownCodes = new Set(BODY_SIGNS.map(s => s.code));
    const unknownCodes = [];
    withSigns.concat(signOnlyList).forEach(r => signsOf(r).forEach(code => {
        if (!knownCodes.has(code) && unknownCodes.indexOf(code) === -1) unknownCodes.push(code);
    }));

    const fixedBody = bySign.filter(s => s.fixed);
    const pendingBody = bySign.filter(s => !s.fixed);

    const notes = [];
    notes.push(Object.assign({ level: 'info' }, BODY_VESET_RULES.condition));
    if (bySign.length) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.onSymptom));
    }
    if (pendingBody.length) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.notFixed));
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.checkStrictness));
        notes.push(Object.assign({ level: 'dispute' }, BODY_VESET_RULES.checkDispute));
        notes.push(Object.assign({ level: 'dispute' }, BODY_VESET_RULES.classicDispute));
    }
    if (fixedBody.length) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.fixed));
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.checkStrictness));
        notes.push(Object.assign({ level: 'dispute' }, BODY_VESET_RULES.checkDispute));
        notes.push(Object.assign({ level: 'dispute' }, BODY_VESET_RULES.classicDispute));
    }
    if (compound.length) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.compound));
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.compoundDay));
        notes.push(Object.assign({ level: 'info' }, BODY_VESET_RULES.compoundNoOrZarua));
        notes.push(Object.assign({ level: 'dispute' }, BODY_VESET_RULES.compoundOnaBeinonit));
    }
    if (compound.length && (fixedBody.length || pendingBody.length)) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.signOffTime));
    }
    // מיחוש בלא ראייה — הדין החל עליו, וחובת הבדיקה שלאחריו.
    if (standaloneSigns.length) {
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.standalone));
        notes.push(Object.assign({ level: 'strict' }, BODY_VESET_RULES.checkStrictness));
    }

    return {
        configured: true,
        bySign,
        fixedBody,
        pendingBody,
        compound,
        unauditedSigns,
        standaloneSigns,
        unknownCodes,
        notes
    };
}

/**
 * מה שיש להתריע עליו **היום** מחמת וסת הגוף.
 *
 * וסת הגוף אינה תלויה בתאריך, ולכן אין לה יום לסמן בלוח: דינה נוהג
 * "משעה שבאו המיחושים" `[שט ל"ט | עמ' 158]`, וכל עוד המיחוש לא בא — אין מועד.
 * יוצא מן הכלל הוא **הווסת המורכב**, שיש לו זמן ידוע (יום בחודש או הפלגה), ולכן
 * זמנו נכנס למניין זמני הבדיקה (`computed.pendingChecks`, בשדה `kind: 'body'`) —
 * "שצריכה לחשוש באותו היום אף קודם שבא המיחוש" `[שט כ"ז | עמ' 49]`.
 *
 * המודול מחזיר **מה להציג** ולא דין חדש, ושלוש דרגות יש כאן:
 *
 *   - `pending` — עבר זמן הווסת המורכבת ולא נבדקה: "אסורה עד שתבדוק" `[שט כ"ד | עמ' 7]`,
 *     ולהלכה כך אף בוסת הגוף שאינה קבועה `[שט ל"ט | עמ' 160]`. הקודם לכל.
 *   - `today` — היום עצמו הוא יום הווסת המורכבת: חוששת בו אף קודם שבא המיחוש.
 *   - `armed` — מיחוש שתועד ועומד: משעה שיבוא — אסורה כדין שעת הוסת, ואם עבר ולא
 *     נבדקה — אסורה עד שתבדוק. זו התזכורת הקבועה, כשאין מועד מסוים לתבוע.
 *
 * @param {Object} params
 * @param {Object} params.bodyVeset - תוצאת `analyzeBodyVeset`
 * @param {Object} [params.prishot] - החששות הנוהגים (`computed.prishot`)
 * @param {Array}  [params.pendingChecks] - `computed.pendingChecks`
 * @param {number} params.today - היום (abs) שלפיו נבחנת התזכורת
 * @returns {{
 *   active: boolean, level: string, title: string, lines: Array<string>,
 *   source: string, dues: Array, signs: Array<string>, help: string
 * }}
 */
export function bodyReminder({ bodyVeset, prishot, pendingChecks, today }) {
    const empty = {
        active: false, level: 'none', title: '', lines: [],
        source: '', dues: [], signs: [], help: BODY_HELP_TOPIC
    };
    if (!bodyVeset || !bodyVeset.configured) return empty;

    const signs = bodyVeset.bySign || [];
    // וסת מורכב שהוסר מחמת מסולקת דמים אינו תובע דבר — הוא מוצג בפאנל כמה שהוסר.
    const compound = (bodyVeset.compound || []).filter(c =>
        !(bodyVeset.displaced || []).some(d => d.compound === c));
    if (signs.length === 0 && compound.length === 0) return empty;

    const signLabels = signs.map(s => s.label);
    const timesText = (n) => (n === 1 ? 'פעם אחת' : (n === 2 ? 'פעמיים' : `${n} פעמים`));

    // 1. חובת בדיקה שעברה בלא בירור — "אסורה לבעלה עד שתבדוק".
    const dues = (pendingChecks || []).filter(p => p.kind === 'body');
    if (dues.length) {
        return {
            active: true,
            level: 'pending',
            title: 'עבר זמן הווסת ולא נבדקה — אסורה עד שתבדוק',
            lines: [
                'בלא בדיקה לא נברר שלא ראתה, ולכן הדין הוא שאסורה לבעלה עד שתבדוק '
                    + '[שט כ"ד | עמ\' 7], ולהלכה כך אף בוסת הגוף שאינה קבועה [שט ל\"ט | עמ\' 160].',
                'הבדיקה הנדרשת: בדיקה כדין — בעומק ובחו"ס; קינוח לבד אינו מברר שלא ראתה '
                    + '[שט מ"א | עמ\' 182].'
            ],
            source: '[שט כ"ד | עמ\' 7] · [שט ל\"ט | עמ\' 160] · [שט מ"א | עמ\' 182]',
            dues: dues.map(d => ({ abs: d.abs, ona: d.ona, code: d.code, reason: d.reason })),
            signs: signLabels,
            help: BODY_HELP_TOPIC
        };
    }

    // 2. מיחוש שתועד **בלא ראייה** ולא נבדקה: לתביעה הזו יש תאריך — הואיל והמיחוש
    // עצמו הוא שאסר. זה הפער שהיה פתוח: "מיחוש שיבוא לבדו אינו ידוע למנוע ואין לו
    // תזכורת מתוארכת".
    //
    // דרגת הוודאות (2026-09-20, מסמכי "יסודות הבית" — מקור משני) קובעת רק את
    // **חומרת התביעה של הרגע הזה**, לא את הקביעות עצמה: `certain` (ברירת המחדל)
    // הוא ההתנהגות המקורית ("אסורה עד שתבדוק"); `likely`/`vague` מקילים, ואינם
    // אוסרים אלא תובעים בדיקה בקרוב, או בדיקה קלה בלבד.
    const allUnchecked = (bodyVeset.standaloneSigns || [])
        .filter(s => !s.checked && s.abs <= today);
    const uncheckedSigns = allUnchecked.filter(s => s.certainty === 'certain');
    const likelySigns = allUnchecked.filter(s => s.certainty === 'likely');
    const vagueSigns = allUnchecked.filter(s => s.certainty === 'vague');

    if (uncheckedSigns.length) {
        return {
            active: true,
            level: 'pending',
            title: 'מיחוש שתועד בלא ראייה — אסורה עד שתבדוק',
            lines: [
                'המיחוש עצמו אוסר: "משעה שבאו המיחושים אסורה כדין שעת הוסת" [שט ל\'ט | עמ\' 158], '
                    + 'ואם עבר ולא נבדקה — אסורה עד שתבדוק [שט ל\"ט | עמ\' 160].',
                'והמיחוש הזה תועד בלא ראייה, ולכן הוא נספר לוסת הגוף: ג\' פעמים לאותו מיחוש '
                    + 'קובעות וסת, ואף פחות מכך — חוששת לו כדין וסת שאינו קבוע [שט ל\"ט | עמ\' 160].',
                'הבדיקה הנדרשת: בדיקה כדין — בעומק ובחו"ס; קינוח לבד אינו מברר שלא ראתה '
                    + '[שט מ"א | עמ\' 182].'
            ],
            source: '[שט ל\'ט | עמ\' 158] · [שט ל\"ט | עמ\' 160] · [שט מ"א | עמ\' 182]',
            dues: uncheckedSigns.map(s => ({
                abs: s.abs, ona: s.ona, code: 'מיחוש', reason: 'מיחוש בלא ראייה שתועד'
            })),
            signs: signLabels,
            help: BODY_HELP_TOPIC
        };
    }

    // 2ב. מיחוש שסומן "סביר" — מותרת בינתיים, אך תובעת בדיקה בקרוב (לא "אסורה").
    if (likelySigns.length) {
        return {
            active: true,
            level: 'likely',
            title: 'מיחוש שתועד — סביר שהוסת קרובה',
            lines: [
                'המיחוש סומן בדרגת ודאות "סביר" — לא בטוחה שהוסת בא מיד, אך יש סבירות שיבוא '
                    + 'בין שעה ליממה. מותרת בינתיים, אך רצוי לבדוק בקרוב.',
                'דרגת ודאות היא תוספת תפעולית (מקור: מסמכי "יסודות הבית" — לא אומת מול הספר '
                    + 'הראשי), ואינה משנה את קביעות וסת הגוף עצמה: ג\' פעמים לאותו מיחוש עדיין קובעות וסת.'
            ],
            source: 'מסמכי "יסודות הבית" (מקור משני — לא אומת מול הספר הראשי)',
            dues: likelySigns.map(s => ({
                abs: s.abs, ona: s.ona, code: 'מיחוש', reason: 'מיחוש בלא ראייה — דרגת ודאות "סביר"'
            })),
            signs: signLabels,
            help: BODY_HELP_TOPIC
        };
    }

    // 2ג. מיחוש שסומן "מסופק" — מותרת, רק בדיקת בגד וקינוח חיצוני לפני תשמיש.
    if (vagueSigns.length) {
        return {
            active: true,
            level: 'vague',
            title: 'מיחוש שתועד — מיחוש רחוק / מסופק',
            lines: [
                'המיחוש סומן בדרגת ודאות "מסופק" — מיחוש רחוק, בלא בטחון שהוא מבשר ראייה '
                    + 'מיידית. מותרת בתשמיש, ומומלץ לבדוק בגד תחתון ולקנח קינוח חיצוני קודם.',
                'דרגת ודאות היא תוספת תפעולית (מקור: מסמכי "יסודות הבית" — לא אומת מול הספר '
                    + 'הראשי), ואינה משנה את קביעות וסת הגוף עצמה: ג\' פעמים לאותו מיחוש עדיין קובעות וסת.'
            ],
            source: 'מסמכי "יסודות הבית" (מקור משני — לא אומת מול הספר הראשי)',
            dues: vagueSigns.map(s => ({
                abs: s.abs, ona: s.ona, code: 'מיחוש', reason: 'מיחוש בלא ראייה — דרגת ודאות "מסופק"'
            })),
            signs: signLabels,
            help: BODY_HELP_TOPIC
        };
    }

    // 3. היום עצמו הוא יום הווסת המורכב — חוששת בו אף קודם שבא המיחוש.
    const todayConcerns = ((prishot || {})[today] || []).filter(p =>
        p.code === COMPOUND_MONTH_CODE || p.code === COMPOUND_HAFLAGAH_CODE);
    if (todayConcerns.length) {
        return {
            active: true,
            level: 'today',
            title: 'היום יום הווסת המורכבת — יום ומיחוש',
            lines: [
                [...new Set(todayConcerns.map(p => p.reason))].join(' · '),
                'חוששת באותו היום אף קודם שבא המיחוש — שמא בשעת תשמיש יבוא המיחוש ותראה '
                    + '[שט כ"ז | עמ\' 49] — ולכן יש לבדוק בו בדיקה כדין: בעומק ובחו"ס.',
                'אם יעבור היום ולא תבדוק — אסורה עד שתבדוק, אף בלא ראייה [שט ל\"ט | עמ\' 160].'
            ],
            source: '[שט כ"ז | עמ\' 49] · [שט ל\"ט | עמ\' 160]',
            dues: [],
            signs: signLabels,
            help: BODY_HELP_TOPIC
        };
    }

    // 4. מיחוש שתועד ועומד — התזכורת הקבועה, אף שאין מועד לתבוע.
    const lines = signs.map(s => (s.fixed
        ? `${s.label} — נקבעה וסת הגוף לאותו מיחוש (ג' פעמים): משעה שיבוא המיחוש דינה כהגיע שעת וסתה.`
        : `${s.label} — נרשם ${timesText(s.count)}: "חוששת לו כדין וסת שאינו קבוע", ולכן כשתבא המיחוש חוששת לו אף ביום אחר.`));
    lines.push('ואם יבוא המיחוש ולא תבדוק — אסורה עד שתבדוק, שהרי בוסת הגוף אף כשאינה '
        + 'קבועה יש להחמיר בזה כמו בוסת הקבוע [שט ל\"ט | עמ\' 160].');
    lines.push('הבדיקה הנדרשת: בדיקה כדין — בעומק ובחו"ס; קינוח לבד אינו מברר שלא ראתה '
        + '[שט מ"א | עמ\' 182].');

    return {
        active: true,
        level: 'armed',
        title: 'וסת הגוף — מיחוש גופני שתועד',
        lines,
        source: '[שט ל\'ט | עמ\' 158] · [שט ל\"ט | עמ\' 160]',
        dues: [],
        signs: signLabels,
        help: BODY_HELP_TOPIC
    };
}
