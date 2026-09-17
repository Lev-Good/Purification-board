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
│   ├── storage.js              # שכבת גישה יחידה ל-localStorage + גיבוי/שחזור JSON
│   └── zmanim.js               # רשימת ערים (Hebcal classic cities) + חישוב שקיעה/יום הלכתי
├── LICENSE                  # GPL-2.0-or-later (טקסט רשמי מ-SPDX)
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
- `files` בקונפיגורציה קובע אילו קבצים נכנסים ל-`app.asar` הארוז, כולל `icon.png` (תוקן בעבר — היה חסר).
- `publish` בקונפיגורציה מצביע על `provider: github, owner: Lev-Good, repo: Purification-board` — נדרש כדי ש-`electron-updater` ידע איפה לבדוק גרסאות. **לא בוצע כל פרסום (publish) בפועל** — זו קונפיגורציה בלבד.
- `icon.png` תוקן: הקובץ היה בפועל JPEG (חתימת `FFD8FF`) עם סיומת `.png` שגויה. הומר בפועל לקובץ PNG תקין (1024x1024) באמצעות `nativeImage` של Electron.

## היום ההלכתי (שקיעה) — `js/zmanim.js`
- `CITIES`: רשימה קבועה של כ-65 ערים (מתוך "classic cities" המוטמעות ב-Hebcal), עם תוויות בעברית.
- `getSunset(cityKey, date)`: עוטף את `Zmanim` של Hebcal לחישוב שקיעה לפי קו רוחב/אורך של העיר.
- `getHalachicTodayAbs(cityKey)`: אם הוגדרה עיר וכעת אחרי השקיעה — מחזיר abs+1 (היום ההלכתי כבר התחלף); אחרת מתנהג כמו `new HDate().abs()` הרגיל (ללא עיר — תלוי חצות לועזי, כמקודם).
- כל מקום ב-`ui.js`/`app.js` שהתייחס בעבר ל"היום" via `new HDate().abs()` מקבל כעת פרמטר `todayAbs` שמחושב פעם אחת ב-`refreshCalendar()` ומוזרם דרך `renderScreenCalendar`, `buildMonthGridHTML`, `buildYearlyRowHTML`, `updateDashboard`.

## התראות (Notification API) — `js/app.js`
- הגדרה ב-`localStorage` (`taharahNotifications`): `off` / `daily` / `events`.
- לפני הפעלה, מתבקשת הרשאת `Notification.requestPermission()` (רק אם `default`; אין ניסיון חוזר אם `denied`, כפי שדפדפנים אוסרים).
- `checkAndFireNotification()` נקרא בסוף כל `refreshCalendar()`: קובע האם היום "יום אירוע" (פרישה/יום 1 של נקיים/הפסק/צפי טבילה הלילה), ומשתמש בטקסט שכבר מוצג בדשבורד (`#dashboard-container .dashboard-text`) כגוף ההתראה — כדי למנוע כפילות לוגיקה מול `updateDashboard`. נשמר "מרקר" (`abs:mode`) כדי לא לשלוח התראה כפולה לאותו יום הלכתי.
- **מגבלה מתועדת**: התראות פועלות רק כאשר האפליקציה פתוחה/רצה (כולל במגש המערכת ב-Electron אם "הפעלה אוטומטית" מופעלת) — אין שירות רקע נפרד מחוץ לתהליך ה-Renderer.

## מגש מערכת + הפעלה אוטומטית (Electron בלבד) — `main.js`
- הגדרת "הפעל אוטומטית עם המחשב" (`taharahAutoLaunch` ב-`localStorage`, מסונכרנת דרך `window.api.setAutoLaunch` ל-IPC `set-auto-launch`) שולטת בו-זמנית ב:
  1. `app.setLoginItemSettings({openAtLogin})`.
  2. יצירת `Tray` עם תפריט (פתח / יציאה), ומניעת סגירת החלון בפועל (`win.on('close')` מבצע `hide()` במקום לתת לחלון להיסגר) — כך שהתהליך (וממנו ההתראות) ממשיך לרוץ ברקע.
- כאשר ההגדרה כבויה, ההתנהגות זהה לגמרי לקודם (סגירה = יציאה).

## עדכוני תוכנה (Electron בלבד) — `main.js` + `electron-updater`
- `autoUpdater.autoDownload = false` — הבדיקה/הורדה/התקנה יזומות רק דרך כפתור בהגדרות ("בדוק אם יש עדכון חדש"), לא אוטומטי ברקע.
- אירועי autoUpdater (`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`) משודרים ל-Renderer דרך `win.webContents.send('update-status', ...)` ומוצגים כטקסט/כפתור בהגדרות.
- לפני התקנה (`quitAndInstall`), ה-Renderer מפעיל הורדת גיבוי אוטומטית (`downloadBackup`) כרשת ביטחון נוספת שהמשתמש ביקש — למרות שנתוני `localStorage` ממילא נשמרים אוטומטית בין עדכוני גרסה (אותה תיקיית `userData`), כל עוד ה-`appId` לא משתנה.

## אינטגרציות חיצוניות
| שירות | תפקיד | היכן בקוד |
|---|---|---|
| FormSubmit.co | שליחת ריכוז נתונים למייל שבחר המשתמש | `js/app.js` — `sendEmailViaFormSubmit()` |
| Google Apps Script Web App | שמירה/שחזור (אימייל, PIN) | `js/security.js`, `js/app.js` — `WEB_APP_URL` |
| Google Fonts | פונט Rubik | `index.html` (`<link>`) |
| GitHub Releases | בדיקת עדכוני תוכנה (Electron) | `main.js` — `autoUpdater`, `package.json` — `build.publish` |

## תהליכי רקע
אין Service Worker בפועל (המניפסט מוזרק ב-runtime לצורך "הוסף למסך הבית", אך אין קובץ `sw.js` הרשום). אין polling כללי — למעט בדיקת ההתראות שרצה כחלק מ-`refreshCalendar()` (נקרא בכל אינטראקציה/ניווט, לא בטיימר קבוע).
