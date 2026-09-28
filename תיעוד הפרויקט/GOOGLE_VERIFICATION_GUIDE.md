# מדריך שלם: הקמת פרויקט Google Cloud, חיבור דומיין ואימות אפליקציה (OAuth Verification)

> **מדריך מעשי צעד-אחר-צעד**  
> נכתב במיוחד עבור אפליקציית **"לוח טהרת המשפחה" (Taharah Board)**.  
> מטרת המדריך: לאפשר סנכרון יומן והתראות מייל לאלפי משתמשים **מבלי לפגוע במשתמשי הגיבוי הקיימים ב-Sheets** ובאפס עלויות.

---

## תוכן עניינים
1. [כלל הברזל: איך לבצע הכל בלי לסכן את המשתמשים הקיימים](#1-כלל-הברזל-איך-לבצע-הכל-בלי-לסכן-את-המשתמשים-הקיימים)
2. [שלב א': העלאת אתר האינטרנט ומדיניות הפרטיות ל-GitHub Pages](#2-שלב-א-העלאת-אתר-האינטרנט-ומדיניות-הפרטיות-ל-github-pages)
3. [שלב ב': חיבור תת-דומיין ייעודי (Subdomain) לאתר ב-GitHub](#3-שלב-ב-חיבור-תת-דומיין-ייעודי-subdomain-לאתר-ב-github)
4. [שלב ג': אימות בעלות על הדומיין ב-Google Search Console](#4-שלב-ג-אימות-בעלות-על-הדומיין-ב-google-search-console)
5. [שלב ד': הגדרת הפרויקט ב-Google Cloud Console (קליק-אחר-קליק)](#5-שלב-ד-הגדרת-הפרויקט-ב-google-cloud-console-קליק-אחר-קליק)
6. [שלב ה': הקלטת סרטון ההדגמה ל-YouTube (תסריט ודרישות חובה)](#6-שלב-ה-הקלטת-סרטון-ההדגמה-ל-youtube-תסריט-ודרישות-חובה)
7. [שלב ו': הגשת בקשת האימות (טקסטים מוכנים להעתקה והדבקה)](#7-שלב-ו-הגשת-בקשת-האימות-טקסטים-מוכנים-להעתקה-והדבקה)

---

## 1. כלל הברזל: איך לבצע הכל בלי לסכן את המשתמשים הקיימים

כרגע יש לך פרויקט פעיל ב-Google Cloud שבו המשתמשים מגבים את הנתונים שלהם ל-Google Sheets באמצעות הרשאת `drive.file` הלא-רגישה.

⚠️ **כדי לא לגעת ולא לסכן את המשתמשים הקיימים בשום צורה:**
* **פותחים פרויקט חדש לגמרי ב-Google Cloud Console** (למשל בשם: `Taharah Board Production`).
* הפרויקט הישן ממשיך לעבוד כרגיל ב-100% עבור כל מי שמשתמש בגיבוי.
* רק לאחר שהפרויקט החדש יעבור את כל תהליך האימות של גוגל ויקבל "וי ירוק", נטמיע את ה-Client ID וה-Client Secret החדשים שלו בגרסה הבאה של האפליקציה!

---

## 2. שלב א': העלאת אתר האינטרנט ומדיניות הפרטיות ל-GitHub Pages

הכנו עבורך מראש תיקייה מוכנה בפרויקט בשם [`website-gh-pages/`](file:///c:/Users/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9/Downloads/%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%D7%99%D7%9D/%D7%9C%D7%95%D7%97%20%D7%98%D7%94%D7%A8%D7%94/website-gh-pages/) עם 3 קבצים מלאים ומעוצבים:
1. `index.html` – דף הבית של האפליקציה.
2. `privacy.html` – מדיניות פרטיות מלאה הכוללת את נוסח ה-Limited Use Disclosure שגוגל דורשת באנגלית ובעברית.
3. `terms.html` – תנאי שימוש באפליקציה.

### איך להעלות ל-GitHub:
1. היכנס לחשבון ה-GitHub שלך.
2. צור מאגר (Repository) חדש, ציבורי (Public), בשם: `taharah-site` (או כל שם שתבחר).
3. העלה למאגר זה את שלושת הקבצים שבתיקיית `website-gh-pages/`.
4. היכנס בהגדרות המאגר: **Settings** → בתפריט השמאלי בחר **Pages**.
5. תחת **Build and deployment** / **Source**:
   * בחר **Deploy from a branch**.
   * בחר ב-Branch: `main` (או `master`), ובתיקייה: `/ (root)`.
   * לחץ **Save**.
6. תוך כדקה-שתיים האתר שלך באוויר בכתובת:  
   `https://<your-username>.github.io/taharah-site/`

---

## 3. שלב ב': חיבור תת-דומיין ייעודי (Subdomain) לאתר ב-GitHub

גוגל דורשת שהאתר ומדיניות הפרטיות ישבו תחת דומיין שנמצא בבעלותך (לדוגמה: `taharah.yourdomain.com`).

### 1. הגדרת רשומת DNS אצל ספק הדומיין שלך (Cloudflare / GoDaddy / Box וכו'):
* היכנס לאזור ניהול ה-DNS של הדומיין שלך (`yourdomain.com`).
* הוסף רשומה חדשה מסוג **CNAME**:
  * **Type:** `CNAME`
  * **Name / Host:** `taharah` (זה יוצר את `taharah.yourdomain.com`)
  * **Target / Points to:** `<your-username>.github.io`
  * **TTL:** Automatic (או 3600)
  * *(אם אתה ב-Cloudflare, ודא שה-Proxy מופעל או DNS Only, שניהם נתמכים)*

### 2. הגדרת הדומיין ב-GitHub Pages:
* חזור להגדרות ה-Repository ב-GitHub: **Settings → Pages**.
* תחת **Custom domain**, הזן: `taharah.yourdomain.com` ולחץ **Save**.
* המתן מספר דקות עד שמופיע צ'קבוקס ירוק: **Enforce HTTPS** – סמן אותו ב-V.
* כעת האתר, מדיניות הפרטיות ותנאי השימוש נגישים בכתובות:
  * `https://taharah.yourdomain.com/`
  * `https://taharah.yourdomain.com/privacy.html`
  * `https://taharah.yourdomain.com/terms.html`

---

## 4. שלב ג': אימות בעלות על הדומיין ב-Google Search Console

גוגל מחייבת להוכיח שהדומיין שלך לפני שהיא מאשרת להשתמש בו ב-OAuth.

1. היכנס ל-[Google Search Console](https://search.google.com/search-console) עם חשבון הגוגל שאיתו תפתח את הפרויקט ב-Cloud.
2. לחץ על **Add Property** (הוסף נכס):
   * בחר באפשרות השמאלית: **Domain** (דומיין).
   * הקלד את שם הדומיין הראשי שלך: `yourdomain.com`.
3. גוגל תציג לך רשומת אימות **TXT** (מחרוזת ארוכה שמתחילה ב-`google-site-verification=...`).
4. היכנס שוב לניהול ה-DNS של הדומיין שלך והוסף רשומה:
   * **Type:** `TXT`
   * **Name / Host:** `@` (או השאר ריק לפי הממשק)
   * **Content / Value:** הדבק את המחרוזת של גוגל.
5. חזור ל-Search Console ולחץ **Verify** (אימות). ברגע שזה מאושר – הדומיין וכל תתי-הדומיינים שלו מאומתים עבור כל שירותי גוגל!

---

## 5. שלב ד': הגדרת הפרויקט ב-Google Cloud Console (קליק-אחר-קליק)

### 1. יצירת פרויקט חדש
1. היכנס ל-[Google Cloud Console](https://console.cloud.google.com/).
2. לחץ למעלה על בחירת פרויקטים → **New Project**.
3. שם הפרויקט: `Taharah Board Production` → לחץ **Create**.
4. ודא שהפרויקט החדש נבחר בשורה העליונה.

### 2. הפעלת ה-APIs הנדרשים
1. בתפריט הצדדי: **APIs & Services** → **Library**.
2. חפש והפעל (**Enable**) את שלושת השירותים הבאים:
   * **Google Calendar API** (עבור סנכרון היומן והתראות המייל).
   * **Google Drive API** (עבור יצירת גיליון הגיבוי).
   * **Google Sheets API** (עבור כתיבת ועדכון הגיבוי).

### 3. מסך ההסכמה (OAuth consent screen)
בתפריט הצדדי: **APIs & Services** → **OAuth consent screen**:
1. בחר **External** (חיצוני) ולחץ **Create**.
2. **מסך 1: App information:**
   * **App name:** `לוח טהרת המשפחה` (או `Taharah Board`).
   * **User support email:** בחר את כתובת המייל שלך.
   * **App domain:**
     * Application home page: `https://taharah.yourdomain.com/`
     * Application privacy policy link: `https://taharah.yourdomain.com/privacy.html`
     * Application terms of service link: `https://taharah.yourdomain.com/terms.html`
   * **Authorized domains:** הוסף `yourdomain.com` (בלי https, בלי תת-דומיין).
   * **Developer contact information:** הזן את כתובת המייל שלך.
   * לחץ **Save and Continue**.

3. **מסך 2: Scopes (היקפי הרשאה):**
   * לחץ על **Add or Remove Scopes**.
   * סמן את שני ההיקפים הבאים בלבד:
     1. `.../auth/drive.file` (Non-sensitive — לגיבוי לשיטס).
     2. `.../auth/calendar` (Sensitive — לניהול לוח השנה הייעודי).
   * לחץ **Update** ולאחר מכן **Save and Continue**.

4. **מסך 3: Test users:**
   * הוסף את חשבון הגוגל שלך ואת חשבונות הבודקים הקרובים (עד 100 משתמשים).
   * חשבונות אלו יכולים להתחבר מיד ללא שום אזהרה עוד לפני האימות.
   * לחץ **Save and Continue**.

### 4. יצירת מזהה הלקוח (Credentials)
1. עבור אל **APIs & Services** → **Credentials**.
2. לחץ על **Create Credentials** → **OAuth client ID**.
3. ב-Application type בחר: **Desktop app**.
4. שם: `Taharah Board Desktop Client`.
5. לחץ **Create**.
6. יופיעו על המסך שני ערכים:
   * **Client ID** (`xxxxxxxx.apps.googleusercontent.com`)
   * **Client Secret** (`GOCSPX-xxxxxxxx`)
   * שמור אותם בצד!

---

## 6. שלב ה': הקלטת סרטון ההדגמה ל-YouTube (תסריט ודרישות חובה)

גוגל בודקת את הסרטון הזה ידנית על ידי בודק אנושי. הסרטון צריך להיות באורך של כ-1 עד 2 דקות.

### כללי ברזל לסרטון (כדי שלא יידחה):
* **איכות:** לפחות 720p או 1080p.
* **העלאה ל-YouTube:** הגדר את הסרטון כ-**Unlisted** (לא רשום — רק מי שיש לו הקישור יכול לצפות).
* **שורת הכתובת בדפדפן (חובה!):** שורת ה-URL חייבת להיות פתוחה וברורה בזמן מסך ההתחברות של גוגל, כדי שהבודק יראה את ה-`client_id` בכתובת.

### תסריט ההקלטה המומלץ:
1. **שניות 0:00–0:15:**
   * פתח את אפליקציית "לוח טהרה" במחשב.
   * פתח את מסך ההגדרות, והראה את הכפתורים "חבר חשבון גוגל" ו"סנכרן יומן גוגל".
2. **שניות 0:15–0:40 (החיבור מול גוגל):**
   * לחץ על כפתור החיבור באפליקציה.
   * הדפדפן נפתח לדף ההתחברות של גוגל.
   * **הצבע עם העכבר על שורת הכתובת (URL)** כדי שיראו את ה-`client_id`.
   * הראה את מסך בקשת ההרשאות (שבו כתוב שהאפליקציה מבקשת גישה לקבצים שהיא יצרה ב-Drive וליומן Google Calendar).
   * בחר בחשבון ולחץ **הרשה / Continue**.
3. **שניות 0:40–1:15 (הדגמת הפעולה):**
   * חזור לאפליקציה — הראה שהיא מציגה: "מחובר לחשבון (email)".
   * הוסף אירוע/בדיקה באפליקציה (או לחץ "סנכרן כעת").
4. **שניות 1:15–1:45 (התוצאה ביומן גוגל):**
   * פתח בדפדפן את `calendar.google.com`.
   * הראה שנוצר לוח שנה נפרד בשם "לוח טהרה - תזכורות אישיות".
   * לחץ על אחד האירועים שנוצרו ביומן והראה את פרטי האירוע: שעת האירוע, והתראת המייל שמוגדרת עליו (למשל: "Email notification 60 minutes before").
   * סיים את ההקלטה.

---

## 7. שלב ו': הגשת בקשת האימות (טקסטים מוכנים להעתקה והדבקה)

כשאתה מוכן, היכנס ב-Google Cloud Console אל:  
**APIs & Services** → **OAuth consent screen** → לחץ על כפתור **Publish App**, ולאחר מכן לחץ על **Prepare for Verification** / **Submit for Verification**.

הנה הטקסטים המדויקים באנגלית למילוי בטופס הבקשה:

### שאלה 1: How will the app use the requested scopes? (מדוע נדרשות ההרשאות?)

```text
Taharah Board is a personal, local-first desktop application designed to assist users in managing halachic personal calendar dates, required examinations, and separation times in family purity law.

We are requesting two scopes:

1. https://www.googleapis.com/auth/drive.file:
Used exclusively to create and update a single backup spreadsheet in the user's personal Google Drive. The app only accesses files that it creates itself, ensuring user privacy and enabling data restoration if they migrate computers.

2. https://www.googleapis.com/auth/calendar:
Since Taharah Board is an offline-first desktop application, the user's computer is frequently powered off during designated reminder hours (such as early morning or before sunset). We use this scope to create a dedicated secondary calendar named "Taharah Board Reminders" and schedule email notifications for examination times and separation dates. This allows Google's servers to deliver timely reminders to the user even when the desktop software is closed.
```

### שאלה 2: Explain why you cannot use a non-sensitive scope instead
```text
For Google Drive, we already adhere to the least privileged non-sensitive scope (drive.file). 
For Google Calendar, to prevent cluttering the user's primary schedule and to respect personal intimacy and privacy, our app creates and manages a dedicated secondary calendar. Creating a separate secondary calendar and scheduling email alerts requires the calendar scope.
```

### שאלה 3: YouTube Demo Video Link
הדבק את הקישור לסרטון שהעלית כ-Unlisted ל-YouTube.

---

## מה קורה לאחר ההגשה?
1. תקבל מייל אוטומטי מגוגל המאשר שהבקשה התקבלה (`OAuth App Verification Request`).
2. תוך 3–5 ימי עסקים יחזור אליך בודק אנושי מטעם Trust & Safety של Google.
3. אם הכל תואם את המדריך, הפרויקט יאושר מיידית והאפליקציה תהיה מאומתת (Verified).
4. ברגע שהפרויקט מאושר, תוכל להעתיק את ה-Client ID וה-Client Secret לקובץ `main.js` של האפליקציה, וכל 2,000+ המשתמשים שלך ייהנו מסנכרון יומן והתראות מייל בחינם, בצורה יציבה וללא שום מסך אזהרה!
