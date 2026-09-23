using Taharah.Core.Enums;

namespace Taharah.Core.Algorithms;

public sealed class DayMarkDef
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Help { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
}

public sealed class OrZaruaExemption
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
}

public static class DayMarksManager
{
    public static readonly List<DayMarkDef> DayMarks =
    [
        new() { Code = "stain", Label = "מצאתי כתם", Help = "stain", Source = "[שט ל\"ה | עמ' 127–128]" },
        new() { Code = "fright", Label = "פחד פתאום (ביעתותא)", Help = "fright", Source = "[שט כ\"ז | עמ' 42]" },
        new() { Code = "anxiety", Label = "חרדה מתמשכת", Help = "anxiety", Source = "[שט כ\"ז | עמ' 42]" },
        new() { Code = "travel", Label = "יציאה לדרך / בא מן הדרך", Help = "or_zarua_exempt", Source = "[שט כ\"ז | עמ' 49] · [שט כ\"ח | עמ' 57]" },
        new() { Code = "chuppah", Label = "ליל החופה / בעילת מצוה", Help = "or_zarua_exempt", Source = "[שט כ\"ז | עמ' 49]" }
    ];

    private static readonly HashSet<string> KnownCodes = new(DayMarks.Select(m => m.Code));

    public static List<string> MarksOf(IEnumerable<string>? marks)
    {
        if (marks == null) return [];
        var outList = new List<string>();
        foreach (var m in marks)
        {
            if (KnownCodes.Contains(m) && !outList.Contains(m))
                outList.Add(m);
        }
        return outList;
    }

    public static HashSet<int> StainDays(Dictionary<int, List<string>> marksMap)
    {
        var outSet = new HashSet<int>();
        foreach (var kvp in marksMap)
        {
            if (kvp.Value.Contains("stain"))
                outSet.Add(kvp.Key);
        }
        return outSet;
    }

    public static OrZaruaExemption? OrZaruaExemptionFor(int shiftAbs, OnaType shiftOna, Dictionary<int, List<string>>? marks, HashSet<int>? tevilot)
    {
        var dayMarks = (marks != null && marks.TryGetValue(shiftAbs, out var mList)) ? mList : [];

        if (shiftOna == OnaType.Night && tevilot != null && tevilot.Contains(shiftAbs))
        {
            return new OrZaruaExemption
            {
                Abs = shiftAbs,
                Ona = shiftOna,
                Code = "lilTvila",
                Label = "ליל טבילה",
                Reason = "פטור מעונת אור זרוע — ליל טבילה (\"מותרת, ותבדוק קו\\\"ת\")",
                Source = "[שט כ\"ז | עמ' 49]"
            };
        }

        if (shiftOna == OnaType.Night && dayMarks.Contains("chuppah"))
        {
            return new OrZaruaExemption
            {
                Abs = shiftAbs,
                Ona = shiftOna,
                Code = "chuppah",
                Label = "ליל החופה / בעילת מצוה",
                Reason = "פטור מעונת אור זרוע — ליל החופה / בעילת מצוה (\"מותר\")",
                Source = "[שט כ\"ז | עמ' 49]"
            };
        }

        if (dayMarks.Contains("travel"))
        {
            return new OrZaruaExemption
            {
                Abs = shiftAbs,
                Ona = shiftOna,
                Code = "travel",
                Label = "יציאה לדרך / בא מן הדרך",
                Reason = "פטור מעונת אור זרוע — יוצא לדרך, והוא הדין בבא מן הדרך (\"אף שבעונת הוסת מחמירים לאסור בתשמיש, בעונת האור זרוע יש להקל\")",
                Source = "[שט כ\"ז | עמ' 49] · [שט כ\"ח | עמ' 57]"
            };
        }

        return null;
    }
}
