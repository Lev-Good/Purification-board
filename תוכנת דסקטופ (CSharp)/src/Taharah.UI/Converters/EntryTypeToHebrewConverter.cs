using System.Globalization;
using System.Windows.Data;

namespace Taharah.UI.Converters;

/// <summary>
/// מתרגם את קוד סוג הרישום שנשמר במסד הנתונים ("reiyah" / "hefsek" / "tevilah" / ...)
/// לתווית עברית לתצוגה.
///
/// הרשומות נשמרות בקוד האנגלי ולא בתווית: <see cref="Taharah.Core.Algorithms.VesetEngine.CalendarDayEntry.Type"/>
/// מושווה כמחרוזת בכל מנועי ההלכה (וסת, שבעה נקיים, ליל טבילה, סימוני יום), ולכן
/// התרגום לתצוגה חייב לקרות בשכבת הממשק בלבד - אחרת שינוי של תווית תצוגה היה מפסיק
/// בשקט לזהות רישומים קיימים (כפי שקרה בעבר בסימוני היום - ראו MainViewModel).
/// </summary>
public class EntryTypeToHebrewConverter : IValueConverter
{
    private static readonly Dictionary<string, string> Labels = new()
    {
        ["reiyah"] = "ראייה",
        ["hefsek"] = "הפסק טהרה",
        ["tevilah"] = "טבילה",
        ["check"] = "בדיקה",
        ["sign"] = "מיחוש גופני בלא ראייה",
        ["mark"] = "סימון יום"
    };

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is string code && Labels.TryGetValue(code, out string? label)
            ? label
            : value?.ToString() ?? string.Empty;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotImplementedException();
}
