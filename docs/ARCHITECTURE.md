# ARCHITECTURE.md — ארכיטקטורה טכנית

## מבנה התיקיות
```
/
├── index.html            # דף האפליקציה היחיד (SPA), כולל כל המסכים והמודלים כ-DOM נסתר/גלוי
├── hebcal.js              # ספריית Hebcal מוטמעת (לוח שנה עברי, מולד, זמנים...) — ES Module
├── main.js                # תהליך ה-Main של Electron
├── preload.js              # גשר contextBridge בין ה-Renderer לתהליך ה-Main (הצפנת PIN)
├── package.json            # תלויות + קונפיגורציית electron-builder
├── icon.png                # אייקון האפליקציה (גם לבילד וגם לחלון ה-runtime)
├── css/
│   └── style.css            # כל העיצוב (Design tokens ב-CSS variables, light/dark, responsive, print)
├── js/
│   ├── app.js                # נקודת הכניסה: state, אתחול, event wiring, חשיפת פונקציות ל-window
│   ├── calculations.js        # מנוע החישוב ההלכתי (טהור מ-DOM, פונקציות טהורות)
│   ├── ui.js                  # בניית ה-DOM של הלוח (חודשי/שנתי), טבלת ריכוז, דשבורד
│   ├── icons.js                # מאגר אייקוני SVG כ-template strings
│   ├── notifications.js        # Toast / מודלים גנריים (alert/confirm)
│   ├── security.js             # מסכי נעילה/הגדרה, PIN, שחזור קוד גישה
│   └── storage.js              # שכבת גישה יחידה ל-localStorage + גיבוי/שחזור JSON
└── docs/                    # תיעוד הפרויקט (מסמך זה ואחרים)
```

## עקרון מפתח: אין Build Step
כל קבצי ה-JS נטענים כ-ES Modules ישירות מהדפדפן (`<script type="module" src="./js/app.js">`), ללא Webpack/Vite/Babel. זהו שיקול מכוון: אפשר לפתוח את `index.html` ישירות (או להגיש כסטטי) בלי שלב קומפילציה. אותו קוד בדיוק רץ גם בתוך Electron (`main.js` קורא `win.loadFile('index.html')`).

## זרימת נתונים
1. **מקור האמת**: אובייקט `db` הנשמר תחת המפתח `taharahDB` ב-`localStorage`, כמילון `{ [absDayNumber]: { type, ona?, note? } }` כאשר `absDayNumber` הוא היום המוחלט (Rata Die) מ-Hebcal.
2. **מנוע החישוב** (`calculations.js -> calculateEngine(db, isOrZaruaEnabled)`) הוא פונקציה טהורה: מקבל את ה-DB ודגל "אור זרוע", ומחזיר `{ computed: { nekiim[], tevilot[], prishot{} }, reiyot[] }`. אינו נוגע ב-DOM.
3. **שכבת התצוגה** (`ui.js`) מקבלת את פלט המנוע ובונה HTML של הלוח/טבלה/דשבורד.
4. **`app.js`** הוא המתאם: מחזיק את ה-state של המסך הנוכחי (`currentHDate`, `isYearlyView`, `selectedAbsDate`), קורא ל-`storage.js` לטעינה/שמירה, ל-`calculations.js` לחישוב, ול-`ui.js` לרנדור, ומרכיב הכול מחדש (`refreshCalendar()`) בכל שינוי משתמש.

## Wiring בין HTML ל-JS
מכיוון שהסקריפט נטען כ-`type="module"`, פונקציות טופ-לבל **אינן** נחשפות אוטומטית ל-`window` (בניגוד לסקריפטים רגילים). לכן `index.html` משתמש בתכונות `onclick="functionName()"` הקוראות לפונקציות שכל אחד ממודולי ה-JS חייב לחבר במפורש ל-`window` (`window.foo = function() {...}`). כל קריאה כזו ב-HTML נבדקה מול הגדרה מקבילה ב-`window.*` באחד מהקבצים (`app.js`, `security.js`, `notifications.js`) — ראו [docs/AGENT_LOG.md](AGENT_LOG.md) לתיעוד הבדיקה.

## אבטחה ונעילה
- קוד גישה (PIN בן 6 ספרות) נשמר תחת `taharahPIN`.
- **בדפדפן**: נשמר כטקסט רגיל (אין API הצפנה זמין ללא Electron).
- **ב-Electron**: `preload.js` חושף `window.api.encrypt/decrypt` דרך `contextBridge`, המתקשר ב-IPC (`encrypt-string`/`decrypt-string`) לתהליך ה-Main (`main.js`), המשתמש ב-`safeStorage` המובנה של Electron (הצפנה מבוססת-DPAPI/Keychain לפי מערכת ההפעלה). כך ה-PIN נשמר מוצפן ב-`localStorage` בגרסת הדסקטופ בלבד.
- שחזור קוד גישה שנשכח: אם המשתמש הגדיר אימייל שחזור, הצמד (אימייל, PIN בטקסט גלוי) מסונכרן לשירות Google Apps Script חיצוני (`WEB_APP_URL` ב-`security.js`/`app.js`) בכל שמירה/עדכון של PIN. שחזור מתבצע בבקשת GET לאותו שירות. **הערה לתיעוד**: זהו טרייד-אוף מכוון של הפרויקט (נוחות שחזור מול חשיפת PIN בגלוי לשירות חיצוני) — לא תוקן/שונה בסבב עבודה זה מכיוון שמדובר בהחלטת מוצר קיימת, לא בבאג.

## אריזת דסקטופ (Electron)
- `electron-builder` עם קונפיגורציה ב-`package.json` (`build` key).
- Target: Windows בלבד כרגע (NSIS מתקין + גרסה Portable), ארכיטקטורת x64.
- `files` בקונפיגורציה קובע אילו קבצים נכנסים ל-`app.asar` הארוז. **תוקן בסבב עבודה זה**: `icon.png` היה חסר מרשימה זו על אף ש-`main.js` טוען אותו ב-runtime (`path.join(__dirname, 'icon.png')` עבור אייקון החלון) — ראו [DECISIONS.md](DECISIONS.md).

## אינטגרציות חיצוניות
| שירות | תפקיד | היכן בקוד |
|---|---|---|
| FormSubmit.co | שליחת ריכוז נתונים למייל שבחר המשתמש | `js/app.js` — `sendEmailViaFormSubmit()` |
| Google Apps Script Web App | שמירה/שחזור (אימייל, PIN) | `js/security.js`, `js/app.js` — `WEB_APP_URL` |
| Google Fonts | פונט Rubik | `index.html` (`<link>`) |

## תהליכי רקע
אין Service Worker בפועל (המניפסט מוזרק ב-runtime לצורך "הוסף למסך הבית", אך אין קובץ `sw.js` הרשום). אין polling או טיימרים ברקע.
