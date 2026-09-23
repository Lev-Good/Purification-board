namespace Taharah.Core.Enums;

public enum OnaType
{
    Day,
    Night
}

public enum EventType
{
    Reiyah,         // ראייה
    HefsekTaharah,  // הפסק טהרה
    Bedikah,        // בדיקת שבעה נקיים
    Ketem           // כתם
}

public enum VesetCode
{
    OnaBeinonit30,  // עו"ב - עונה בינונית יום 30
    OnaBeinonit31,  // עו"ל - עונה בינונית יום 31
    OrZarua,        // עוא"ז - אור זרוע
    YomHachodesh,   // יו"ח - יום החודש
    YomHachodeshDisputed, // יו"ח* - יום החודש מסופק (למשל ראייה בל' והחודש הבא חסר)
    Haflagah,       // עו"ה - וסת ההפלגה
    Dilug,          // דילוג
    Kavua,          // וסת קבוע
    Guf             // וסת הגוף
}
