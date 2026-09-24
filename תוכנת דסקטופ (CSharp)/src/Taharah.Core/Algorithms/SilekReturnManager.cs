using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class SilekNote
{
    public string Level { get; set; } = "info";
    public string Title { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
}

public sealed class ReturnInterludeResult
{
    public int FromAbs { get; set; }
    public int UntilAbs { get; set; }
    public List<DormancyWindow> Windows { get; set; } = [];
    public PillPeriod? Pills { get; set; }
    public List<string> Labels { get; set; } = [];
}

public sealed class SilekReturnResult
{
    public ReturnInterludeResult? Interlude { get; set; }
    public List<EstablishedVeset> Restored { get; set; } = [];
    public List<EstablishedVeset> Waiting { get; set; } = [];
    public List<EstablishedVeset> Returned { get; set; } = [];
    public HashSet<string> ReturnedKeys { get; set; } = [];
    public List<SilekNote> Notes { get; set; } = [];
}

public static class SilekReturnManager
{
    public static string VesetKey(EstablishedVeset? veset)
    {
        if (veset == null) return string.Empty;
        string param = veset.Span?.ToString() ?? string.Empty;
        if (veset.Kind == "month") param = veset.DayOfMonth?.ToString() ?? string.Empty;
        else if (veset.Kind == "week") param = veset.Weekday?.ToString() ?? string.Empty;
        else if (veset.Kind == "mevucha") param = string.Join(".", veset.Days);
        else if (veset.Kind == "dilug") param = string.Join(".", veset.Cycle);
        return $"{veset.Kind}|{veset.Ona.ToString().ToLowerInvariant()}|{param}";
    }

    public static PillPeriod? LastEndedPillPeriod(LifeStateVerdict? life, int today)
    {
        var periods = life?.Pills?.Periods ?? [];
        return periods.Where(p => p.EndAbs.HasValue && p.EndAbs.Value < today).LastOrDefault();
    }

    public static ReturnInterludeResult? ReturnInterlude(LifeStateVerdict? life, int today)
    {
        if (life == null || !life.Configured) return null;
        var dormancy = life.Dormancy;
        if (dormancy.Active) return null;

        var endedWindows = dormancy.Windows.Where(w => w.UntilAbs.HasValue && today >= w.UntilAbs.Value).ToList();
        var pills = LastEndedPillPeriod(life, today);
        if (endedWindows.Count == 0 && pills == null) return null;

        var starts = endedWindows.Select(w => w.FromAbs).ToList();
        var ends = endedWindows.Select(w => w.UntilAbs!.Value).ToList();
        if (pills != null)
        {
            starts.Add(pills.StartAbs);
            ends.Add(pills.EndAbs!.Value + 1);
        }

        return new ReturnInterludeResult
        {
            FromAbs = starts.Min(),
            UntilAbs = ends.Max(),
            Windows = endedWindows,
            Pills = pills,
            Labels = endedWindows.Select(w => w.Label).ToList()
        };
    }

    public static string GetReturnSource(string kind) => kind switch
    {
        "month" => "[שט כ\"ט | עמ' 71]",
        "haflagah" => "[שט כ\"ט | עמ' 71]",
        "week" => "[שט ל\"ו | עמ' 137] · [שט כ\"ט | עמ' 71]",
        "dilug" => "[שט ל\"ז | עמ' 149] · [שט כ\"ט | עמ' 71]",
        "mevucha" => "[שט ל\"ב | עמ' 107–108] · [שט כ\"ט | עמ' 71]",
        _ => "[שט כ\"ט | עמ' 71]"
    };

    public static SilekReturnResult AnalyzeSilekReturn(List<ReiyahEvent>? reiyot, LifeStateVerdict? life, int today)
    {
        var interlude = ReturnInterlude(life, today);
        if (interlude == null)
        {
            return new SilekReturnResult();
        }

        var list = reiyot ?? [];
        var counted = list.Where(r => r.Counted).ToList();
        var before = list.Where(r => r.Abs <= interlude.FromAbs).ToList();
        var beforeChazaka = ChazakaManager.AnalyzeChazaka(before);

        var restored = new List<EstablishedVeset>();
        var waiting = new List<EstablishedVeset>();
        var notes = new List<SilekNote>();

        foreach (var veset in beforeChazaka.Established)
        {
            var baseVeset = new EstablishedVeset
            {
                Kind = veset.Kind,
                Ona = veset.Ona,
                DayOfMonth = veset.DayOfMonth,
                Span = veset.Span,
                SpanLabel = veset.SpanLabel,
                Weekday = veset.Weekday,
                WeekdayLabel = veset.WeekdayLabel,
                Days = [.. veset.Days],
                Cycle = [.. veset.Cycle],
                EstablishedBy = [.. veset.EstablishedBy],
                Restored = true,
                RestoredFrom = interlude.Pills != null && interlude.Windows.Count == 0
                    ? "[שט כ\"ז | עמ' 42]"
                    : GetReturnSource(veset.Kind),
                RestoredFromAbs = interlude.UntilAbs
            };

            if (veset.Kind == "haflagah")
            {
                var anchor = counted.FirstOrDefault(r => r.Abs >= interlude.UntilAbs);
                if (anchor != null)
                {
                    baseVeset.RestoredAnchorAbs = anchor.Abs;
                    restored.Add(baseVeset);
                }
                else
                {
                    waiting.Add(baseVeset);
                }
                continue;
            }

            restored.Add(baseVeset);
        }

        var returned = restored.Concat(waiting).ToList();
        var returnedKeys = new HashSet<string>(returned.Select(VesetKey));

        if (returned.Count == 0)
        {
            notes.Add(new SilekNote
            {
                Level = "info",
                Title = "לא היתה לה וסת קבועה קודם הסילוק",
                Text = "החזרה מן הסילוק היא דוקא לוסת שהיתה **קבועה** קודם לכן: \"מה שאמרנו שאחר שעברו ימי הסילוק חוזרת לוסת שקודם הסילוק, הוא דוקא בוסת הקבוע, אבל לוסת שאינו קבוע שהיה לה קודם הסילוק אינה צריכה לחשוש\". ולכן אין כאן חששות חוזרות מעצמן — וסת חדשה נקבעת כדרכה מכאן ולהבא.",
                Source = "[שט כ\"ט | עמ' 71]"
            });
            notes.Add(new SilekNote
            {
                Level = "info",
                Title = "מניין מכאן ולהבא",
                Text = "וסת חדשה תיקבע כדרכה — בחזקת ג' ראיות באותו יום ובאותה עונה (ולהפלגה בד' ראיות בג' הפלגות שוות) — מכאן ולהבא, מן הראיות שאחרי הסילוק.",
                Source = "[שט מ\"א | עמ' 182] · [ד\"ט | עמ' 7]"
            });
        }
        else
        {
            var titles = new List<string>();
            if (restored.Any(v => v.Kind == "month")) titles.Add("וסת הימים (יום החודש) — חוזרת מיד");
            if (restored.Any(v => v.Kind == "haflagah")) titles.Add("וסת ההפלגה — אינה חוזרת עד שתראה");
            if (waiting.Count > 0) titles.Add("וסת ההפלגה — אינה חוזרת עד שתראה (ממתין לראייה)");

            notes.Add(new SilekNote
            {
                Level = "info",
                Title = "חזרה מן הסילוק — " + string.Join(" · ", titles),
                Text = "עם תום הסילוק היא חוזרת לוסתה הקבועה שהיתה לה קודם לכן. "
                    + (waiting.Count > 0
                        ? "וסת ההפלגה אינה חוזרת עד שתראה פעם אחת אחרי הסילוק, ומשעת הראייה נמנה ממנה מניין ההפלגה שהיתה למודה להפליג."
                        : "וסת הימים אינה תלויה בראייה חדשה, ולכן היא חוזרת לחוש לה מיד.")
                    + (interlude.Pills != null && interlude.Windows.Count == 0
                        ? " וזו החזרה שלאחר הפסקת הכדורים — שאף אם נקבע על ידם וסת אחר, אחר שהפסיקה חוזרת לוסתה הראשון."
                        : ""),
                Source = (interlude.Pills != null && interlude.Windows.Count == 0 ? "[שט כ\"ז | עמ' 42] · " : "") + "[שט כ\"ט | עמ' 71]"
            });
        }

        return new SilekReturnResult
        {
            Interlude = interlude,
            Restored = restored,
            Waiting = waiting,
            Returned = returned,
            ReturnedKeys = returnedKeys,
            Notes = notes
        };
    }

    public static bool IsPillEraVeset(EstablishedVeset? veset, int? pillFromAbs)
    {
        if (!pillFromAbs.HasValue || veset == null) return false;
        var by = veset.EstablishedBy;
        return by.Count > 0 && by.All(abs => abs >= pillFromAbs.Value);
    }
}
