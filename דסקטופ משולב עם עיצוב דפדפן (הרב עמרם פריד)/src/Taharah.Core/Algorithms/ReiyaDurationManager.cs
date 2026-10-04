using Taharah.Core.Enums;

namespace Taharah.Core.Algorithms;

public static class ReiyaDurationManager
{
    public const int MaxExtraOnot = 3;
    public const string ExtensionNote = "משיכת הראייה — חוששת גם לעונה הסמוכה";
    public const string ExtensionLongNote = "הראייה נמשכה ד' ימים נוספים ומעלה — אין צריך לחוש אלא לתחילת הראייה";

    public static (int Abs, OnaType Ona) NextOna(int abs, OnaType ona)
    {
        if (ona == OnaType.Day) return (abs, OnaType.Night);
        return (abs + 1, OnaType.Day);
    }

    public static (int Abs, OnaType Ona) PreviousOna(int abs, OnaType ona)
    {
        if (ona == OnaType.Night) return (abs, OnaType.Day);
        return (abs - 1, OnaType.Night);
    }

    public static bool ExtensionIsTooLong(int? durationDays)
    {
        if (!durationDays.HasValue || durationDays.Value <= 1) return false;
        return durationDays.Value - 1 > MaxExtraOnot;
    }

    public static List<(int Abs, OnaType Ona)> ExtensionOnot(int abs, OnaType ona, int? durationDays)
    {
        if (!durationDays.HasValue || durationDays.Value <= 1) return [];
        if (ExtensionIsTooLong(durationDays)) return [];

        int extra = durationDays.Value - 1;
        var outList = new List<(int Abs, OnaType Ona)>();
        var cur = (abs, ona);

        for (int i = 0; i < extra; i++)
        {
            cur = NextOna(cur.abs, cur.ona);
            outList.Add(cur);
        }

        return outList;
    }

    public static List<(int Abs, OnaType Ona)> DurationOnot(int abs, OnaType ona, int? durationDays)
    {
        var list = new List<(int Abs, OnaType Ona)> { (abs, ona) };
        list.AddRange(ExtensionOnot(abs, ona, durationDays));
        return list;
    }

    public static string? DurationNote(int? durationDays)
    {
        if (!durationDays.HasValue || durationDays.Value <= 1) return null;
        return ExtensionIsTooLong(durationDays) ? ExtensionLongNote : ExtensionNote;
    }
}
