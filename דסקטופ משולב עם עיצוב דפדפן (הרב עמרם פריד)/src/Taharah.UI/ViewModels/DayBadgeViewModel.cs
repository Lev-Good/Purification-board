using CommunityToolkit.Mvvm.ComponentModel;

namespace Taharah.UI.ViewModels;

public enum BadgeCategory
{
    Sighting,       // ראייה - אדום / בורדו
    PrishaDay,      // עונת פרישה יום - כתום / חרדל
    PrishaNight,    // עונת פרישה לילה - כחול כהה / סגול
    OrZarua,        // אור זרוע - תכלת / אפור כהה
    Hefsek,         // הפסק טהרה - ירוק בהיר
    ShevaNekiyim,   // ימי שבעה נקיים - כחול בהיר
    Mikveh,         // טבילה - ירוק אמרלד
    Check,          // בדיקה - אפור נטרלי
    Mark,           // סימון יום (כתם וכו') - צהוב
    Fertility,      // חלון פוריות - מנטה / טורקיז עדין
    Ovulation       // יום ביוץ משוער (שיא) - טורקיז מודגש
}

public partial class DayBadgeViewModel : ObservableObject
{
    [ObservableProperty]
    private string _text = string.Empty;

    [ObservableProperty]
    private string _tooltip = string.Empty;

    [ObservableProperty]
    private BadgeCategory _category = BadgeCategory.PrishaDay;

    [ObservableProperty]
    private string _ona = string.Empty; // "יום", "לילה", "יממה"
}
