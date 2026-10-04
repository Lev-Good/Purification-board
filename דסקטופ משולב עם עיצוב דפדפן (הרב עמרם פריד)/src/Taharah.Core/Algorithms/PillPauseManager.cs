using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class PillPauseEstablished
{
    public int OffsetDays { get; set; }
    public OnaType Ona { get; set; }
    public int Count { get; set; }
    public bool Fixed { get; set; }
}

public sealed class PillPauseWindow
{
    public int FromAbs { get; set; }
    public int ToAbs { get; set; }
}

public sealed class PillPauseInfo
{
    public int StartAbs { get; set; }
    public int PauseAbs { get; set; }
    public string Type { get; set; } = "combined";
    public string? TypeLabel { get; set; }
    public string Rule { get; set; } = "standard";
    public int? LastDay { get; set; }
    public PillPauseWindow? Window { get; set; }
    public List<PillPauseEstablished> Established { get; set; } = [];
}

public sealed class ActivePillPause
{
    public int PauseAbs { get; set; }
    public int DayNumber { get; set; }
    public bool Permitted { get; set; }
    public int LastDay { get; set; }
}

public sealed class PillPauseVerdict
{
    public bool Configured { get; set; }
    public List<PillPauseInfo> Pauses { get; set; } = [];
    public List<PrishahEntry> Concerns { get; set; } = [];
    public List<PillPauseEstablished> Established { get; set; } = [];
    public ActivePillPause? Active { get; set; }
    public List<PillPauseInfo> RegimenPauses { get; set; } = [];
    public List<string> Notes { get; set; } = [];
}

/// <summary>
/// The concern for the days right after stopping birth-control pills (A5), and the
/// exemption from the Or Zarua onah for it (A7). Ports js/pillPause.js `analyzePillPause`
/// faithfully: most pill types make her see 2-5 days after stopping [SHT 27 p.40] (day 1
/// is permitted, day 2 on is a stringency of separation - not a check demand, and it does
/// not replace the other concerns); a day she has seen on before, after a PRIOR pause,
/// narrows/extends the window and is treated as her own established (non-fixed, or - after
/// 3 times - fixed) veset for that offset. Orgast-type pills have no computable window at
/// all - the din depends on the regimen, not the pause itself [SHT 27 p.40].
/// </summary>
public static class PillPauseManager
{
    public const string PauseCode = "פה\"כ";
    public const int PillPauseFirstDay = 2;
    public const int PillPauseLastDay = 5;
    public const int PillPauseEstablishWindow = 10;
    public const int PillPauseFixedCount = 3;

    private static readonly string[] DayLetters = ["", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'"];

    public static string PauseDayLabel(int dayNumber) =>
        dayNumber >= 0 && dayNumber < DayLetters.Length ? DayLetters[dayNumber] : dayNumber.ToString();

    public static readonly Dictionary<string, string> PillTypes = new()
    {
        ["combined"] = "כדורים משולבים",
        ["mini"] = "מיני - פרוגסטרון בלבד",
        ["orgast"] = "אורגסט - תלוי בסדר הנטילה",
        ["other"] = "אחר"
    };

    private static readonly Dictionary<string, string> PillPauseRulesByType = new()
    {
        ["combined"] = "standard",
        ["mini"] = "standard",
        ["other"] = "standard",
        ["orgast"] = "regimen"
    };

    /// <summary>Most pill types follow the standard 2-5 day window; Orgast depends on the regimen, not the pause [SHT 27 p.40].</summary>
    public static string PauseRuleOfPillType(string type) => PillPauseRulesByType.GetValueOrDefault(type, "standard");

    /// <summary>Pill periods that have actually ended (by today, if given) - each is a pause.</summary>
    public static List<PillPeriod> PillPauses(LifeStateVerdict? life, int? today)
    {
        var periods = life?.Pills?.Periods ?? [];
        return periods.Where(p => p.EndAbs.HasValue && (!today.HasValue || p.EndAbs.Value <= today.Value))
            .OrderBy(p => p.EndAbs!.Value).ToList();
    }

    /// <summary>Day number within a pause - the pause day itself is 0, the day after is 1.</summary>
    public static int? PauseDayNumber(int pauseEndAbs, int abs)
    {
        int diff = abs - pauseEndAbs;
        return diff >= 0 ? diff : null;
    }

    public static PillPauseVerdict AnalyzePillPause(LifeStateVerdict? life, List<ReiyahEvent>? reiyot, int? today)
    {
        var empty = new PillPauseVerdict();
        if (life == null || !life.Configured) return empty;

        var periods = life.Pills?.Periods ?? [];
        if (periods.Count == 0) return empty;

        var pauses = PillPauses(life, today);
        if (pauses.Count == 0) return empty;

        var sightings = (reiyot ?? []).OrderBy(r => r.Abs).ToList();
        var dormancyWindows = life.Dormancy?.Windows ?? [];
        bool InsideOtherDormancy(int abs) => dormancyWindows.Any(w => abs > w.FromAbs && (!w.UntilAbs.HasValue || abs < w.UntilAbs.Value));
        bool IsOnPills(int abs) => periods.Any(p => abs >= p.StartAbs && (!p.EndAbs.HasValue || abs <= p.EndAbs.Value));

        var establishedBefore = new List<PillPauseEstablished>();
        var concerns = new List<PrishahEntry>();
        var pausesOut = new List<PillPauseInfo>();
        var notes = new List<string>();
        bool hasRegimenPause = false;

        foreach (var pause in pauses)
        {
            int pauseAbs = pause.EndAbs!.Value;
            if (InsideOtherDormancy(pauseAbs)) continue;

            string rule = PauseRuleOfPillType(pause.Type);
            if (rule != "standard")
            {
                hasRegimenPause = true;
                pausesOut.Add(new PillPauseInfo
                {
                    StartAbs = pause.StartAbs,
                    PauseAbs = pauseAbs,
                    Type = pause.Type,
                    TypeLabel = PillTypes.GetValueOrDefault(pause.Type),
                    Rule = rule,
                    LastDay = null,
                    Window = null,
                    Established = []
                });
                continue;
            }

            var before = establishedBefore.ToList();
            int maxOffsetBefore = before.Count > 0 ? before.Max(e => e.OffsetDays) : 0;
            // "מיום השני ואילך יש להחמיר לפרוש אף אם קבעה לה וסת ליום מאוחר יותר" - the
            // window extends to whatever day she has established, if later than day 5.
            int lastDay = Math.Max(PillPauseLastDay, maxOffsetBefore);
            OnaType? fallbackOna = before.Count > 0 ? before.OrderByDescending(e => e.Count).First().Ona : null;

            pausesOut.Add(new PillPauseInfo
            {
                StartAbs = pause.StartAbs,
                PauseAbs = pauseAbs,
                Type = pause.Type,
                TypeLabel = PillTypes.GetValueOrDefault(pause.Type),
                Rule = rule,
                LastDay = lastDay,
                Window = new PillPauseWindow { FromAbs = pauseAbs + PillPauseFirstDay, ToAbs = pauseAbs + lastDay },
                Established = before.ToList()
            });

            for (int dayNumber = PillPauseFirstDay; dayNumber <= lastDay; dayNumber++)
            {
                int abs = pauseAbs + dayNumber;
                var est = before.FirstOrDefault(e => e.OffsetDays == dayNumber);
                List<OnaType> onas = est != null ? [est.Ona] : (fallbackOna.HasValue ? [fallbackOna.Value] : [OnaType.Day, OnaType.Night]);
                string suffix = est != null ? (est.Fixed ? "וסת שנקבעה לה" : "דין וסת שאינו קבוע") : "חומרא - טבעם שרואה בימים הקרובים";
                foreach (var ona in onas)
                {
                    concerns.Add(new PrishahEntry
                    {
                        Abs = abs,
                        Ona = ona,
                        Code = PauseCode,
                        Reason = $"חשש הפסקת כדורים - יום {PauseDayLabel(dayNumber)} להפסקה ({suffix})"
                    });
                }
            }

            // What she saw after THIS pause establishes her own day for FUTURE pauses.
            foreach (var r in sightings)
            {
                int diff = r.Abs - pauseAbs;
                if (diff <= 0 || diff > PillPauseEstablishWindow) continue;
                if (IsOnPills(r.Abs)) continue;
                var found = establishedBefore.FirstOrDefault(e => e.OffsetDays == diff && e.Ona == r.Ona);
                if (found != null)
                {
                    found.Count++;
                    found.Fixed = found.Count >= PillPauseFixedCount;
                }
                else
                {
                    establishedBefore.Add(new PillPauseEstablished { OffsetDays = diff, Ona = r.Ona, Count = 1, Fixed = false });
                }
            }
        }

        if (pausesOut.Count == 0) return empty;

        var established = establishedBefore.OrderBy(e => e.OffsetDays).ThenBy(e => e.Ona).ToList();

        notes.Add("כדורים - חשש לימים שאחרי ההפסקה: יום א' מותרת, מיום ב' ואילך יש להחמיר לפרוש");
        if (established.Count > 0) notes.Add("יום ההפסקה שקבעה לעצמה - כדין וסת שאינו קבוע, ובג' פעמים כדין וסת קבוע");
        if (established.Any(e => e.Fixed)) notes.Add("וסת מכדורים אינה קביעות גמורה - אינה מבטלת את שאר החששות");
        notes.Add("פטור מעונת אור זרוע - חשש יום ההפסקה אינו מוסיף את עונת אור זרוע שלפניו");
        if (hasRegimenPause)
        {
            notes.Add("סוג הכדורים - אורגסט תלוי בסדר הנטילה, ואין חלון ימים קצוב לחשב ממנו חשש");
            notes.Add("התנאי - כדורים שהוכחו כעוצרים את הוסת; קביעות מצטרפת ממספר סוגי כדורים");
        }

        ActivePillPause? active = null;
        if (today.HasValue)
        {
            foreach (var p in pausesOut)
            {
                if (!p.LastDay.HasValue) continue;
                int dayNumber = today.Value - p.PauseAbs;
                if (dayNumber >= 1 && dayNumber <= p.LastDay.Value)
                {
                    active = new ActivePillPause { PauseAbs = p.PauseAbs, DayNumber = dayNumber, Permitted = dayNumber < PillPauseFirstDay, LastDay = p.LastDay.Value };
                    break;
                }
            }
        }

        return new PillPauseVerdict
        {
            Configured = true,
            Pauses = pausesOut,
            Concerns = concerns,
            Established = established,
            Active = active,
            RegimenPauses = pausesOut.Where(p => p.Rule != "standard").ToList(),
            Notes = notes
        };
    }
}
