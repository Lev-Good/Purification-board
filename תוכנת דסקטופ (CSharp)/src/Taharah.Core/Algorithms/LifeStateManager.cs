using Taharah.Core.Calendar;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class LifeStateModel
{
    public bool Enabled { get; set; } = true;
    public int? PregnancyAbs { get; set; }
    public int? BirthAbs { get; set; }
    public bool Nursing { get; set; }
    public bool NursingLenient { get; set; }
    public int? AgeYears { get; set; }
    public List<PillPeriod> Pills { get; set; } = [];
}

public sealed class PillPeriod
{
    public int StartAbs { get; set; }
    public int? EndAbs { get; set; }
    public string Type { get; set; } = "combined";
    public string Reason { get; set; } = "own";
}

public sealed class DormancyWindow
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int FromAbs { get; set; }
    public int? UntilAbs { get; set; }
    public string Source { get; set; } = string.Empty;
}

public sealed class DormancyInfo
{
    public List<DormancyWindow> Windows { get; set; } = [];
    public DormancyWindow? ActiveWindow { get; set; }
    public bool Active { get; set; }
    public bool Ended { get; set; }
    public List<string> Labels { get; set; } = [];
    public int? UpToAbs { get; set; }
    public Func<int, bool> DisqualifiesEstablishment { get; set; } = _ => false;
}

public sealed class PillsInfo
{
    public bool Configured { get; set; }
    public bool Active { get; set; }
    public string? CurrentType { get; set; }
    public List<PillPeriod> Periods { get; set; } = [];
    public Func<int, PillPeriod?> Covering { get; set; } = _ => null;
    public Func<int, int, int> DaysBetween { get; set; } = (_, _) => 0;
}

public sealed class LifeStateVerdict
{
    public bool Configured { get; set; }
    public bool Enabled { get; set; }
    public bool Silek { get; set; }
    public int? SilekSinceAbs { get; set; }
    public bool ExemptFromCheck { get; set; }
    public string? ExemptReason { get; set; }
    public PregnantVerdict? Pregnant { get; set; }
    public DormancyInfo Dormancy { get; set; } = new();
    public PillsInfo Pills { get; set; } = new();
    public List<string> SilekLabels { get; set; } = [];
}

public sealed class PregnantVerdict
{
    public bool Active { get; set; }
    public bool Started { get; set; }
    public bool FirstTrimester { get; set; }
    public int? ConceptionAbs { get; set; }
    public int? SilekFromAbs { get; set; }
    public int? ClosedAtAbs { get; set; }
    public int? DaysPregnant { get; set; }
    public int DaysLeft { get; set; }
}

public static class LifeStateManager
{
    public const int PregnancySilekDays = 90;
    public const int NursingMonths = 24;
    public const int ElderlyQuietDays = 270;
    public const int ElderlyAge = 60;
    public const int MinorAgeYears = 12;

    public static LifeStateModel NormalizeLifeState(LifeStateModel? raw)
    {
        if (raw == null) return new LifeStateModel();
        return new LifeStateModel
        {
            Enabled = raw.Enabled,
            PregnancyAbs = raw.PregnancyAbs,
            BirthAbs = raw.BirthAbs,
            Nursing = raw.Nursing,
            NursingLenient = raw.NursingLenient,
            AgeYears = raw.AgeYears is >= 0 and <= 130 ? raw.AgeYears : null,
            Pills = (raw.Pills ?? []).Where(p => p.StartAbs > 0 && (!p.EndAbs.HasValue || p.EndAbs >= p.StartAbs))
                .OrderBy(p => p.StartAbs).ToList()
        };
    }

    public static bool IsLifeConfigured(LifeStateModel state)
    {
        var s = NormalizeLifeState(state);
        return s.PregnancyAbs != null || s.BirthAbs != null || s.Nursing || s.AgeYears != null || s.Pills.Count > 0;
    }

    /// <summary>Was a sighting marked as caused by pills - excludes it from the natural-sighting count that uproots a haflagah veset.</summary>
    public static bool IsPillSighting(ReiyahEvent r) => r?.Kind == "pills";

    public static int CountPillDays(List<PillPeriod>? periods, int fromAbs, int toAbs)
    {
        if (periods == null || periods.Count == 0 || toAbs < fromAbs) return 0;
        int count = 0;
        foreach (var p in periods)
        {
            int start = Math.Max(fromAbs, p.StartAbs);
            int end = Math.Min(toAbs, p.EndAbs ?? toAbs);
            if (end >= start) count += end - start + 1;
        }
        return count;
    }

    public static int AddHebrewMonths(int abs, int months)
    {
        var b = new HDate(abs);
        int year = b.Year;
        int month = b.Month;
        int day = b.Day;

        for (int i = 0; i < months; i++)
        {
            if (month == 6)
            {
                month = 7;
                year++;
            }
            else if (month >= (HDate.IsLeap(year) ? 13 : 12))
            {
                month = 1;
            }
            else
            {
                month++;
            }
        }

        int daysInMonth = HDate.DaysInMonth(month, year);
        if (day > daysInMonth) day = daysInMonth;
        return new HDate(day, month, year).Abs();
    }

    public static LifeStateVerdict AnalyzeLifeState(LifeStateModel? life, List<ReiyahEvent>? reiyot, int? today)
    {
        var raw = NormalizeLifeState(life);
        var state = raw.Enabled ? raw : new LifeStateModel { Enabled = false };
        int? t = today;
        var windows = new List<DormancyWindow>();

        var verdict = new LifeStateVerdict
        {
            Configured = IsLifeConfigured(raw),
            Enabled = raw.Enabled
        };

        if (!raw.Enabled)
        {
            return verdict;
        }

        // Pregnancy
        if (state.PregnancyAbs.HasValue)
        {
            int silekFromAbs = state.PregnancyAbs.Value + PregnancySilekDays;
            int? closedAtAbs = state.BirthAbs.HasValue && state.BirthAbs.Value > silekFromAbs ? state.BirthAbs.Value : null;
            bool neverBecame = state.BirthAbs.HasValue && state.BirthAbs.Value <= silekFromAbs;
            bool started = !neverBecame && t.HasValue && t.Value >= silekFromAbs;
            bool active = started && (closedAtAbs == null || (t.HasValue && t.Value < closedAtAbs.Value));

            if (started)
            {
                windows.Add(new DormancyWindow
                {
                    Id = "pregnant",
                    Label = "מעוברת",
                    FromAbs = silekFromAbs,
                    UntilAbs = closedAtAbs,
                    Source = "[ד\"ט | עמ' 14] · [שט כ\"ט | עמ' 63, 66]"
                });
            }

            verdict.Pregnant = new PregnantVerdict
            {
                Active = active,
                Started = started,
                ConceptionAbs = state.PregnancyAbs,
                SilekFromAbs = silekFromAbs,
                ClosedAtAbs = closedAtAbs,
                DaysPregnant = t.HasValue ? t.Value - state.PregnancyAbs.Value : null,
                FirstTrimester = !started && t.HasValue && t.Value < silekFromAbs,
                DaysLeft = !t.HasValue || t.Value >= silekFromAbs ? 0 : silekFromAbs - t.Value
            };

            if (active)
            {
                verdict.Silek = true;
                verdict.SilekSinceAbs = silekFromAbs;
                verdict.ExemptFromCheck = true;
                verdict.ExemptReason = "מעוברת שעברו עליה תשעים יום";
                verdict.SilekLabels.Add("הריון");
            }
        }

        // Nursing
        if (state.BirthAbs.HasValue || state.Nursing)
        {
            int? untilAbs = state.BirthAbs.HasValue
                ? AddHebrewMonths(state.BirthAbs.Value, NursingMonths)
                : null;
            bool withinWindow = untilAbs == null ? state.Nursing : (t.HasValue && t.Value < untilAbs.Value);
            bool active = state.NursingLenient && withinWindow;
            int? fromAbs = state.BirthAbs ?? t;
            bool windowStarted = state.NursingLenient && fromAbs.HasValue && (!t.HasValue || t.Value >= fromAbs.Value);

            if (windowStarted && fromAbs.HasValue)
            {
                windows.Add(new DormancyWindow
                {
                    Id = "nursing",
                    Label = "ילדה",
                    FromAbs = fromAbs.Value,
                    UntilAbs = untilAbs,
                    Source = "[שט כ\"ט | עמ' 66]"
                });
            }

            if (active && fromAbs.HasValue)
            {
                verdict.Silek = true;
                verdict.SilekSinceAbs = fromAbs.Value;
                verdict.ExemptFromCheck = true;
                verdict.ExemptReason = "מניקה תוך כ\"ד חודש";
                verdict.SilekLabels.Add("הנקה");
            }
        }

        // Pills
        var periods = state.Pills;
        PillPeriod? activePillPeriod = t.HasValue ? periods.FirstOrDefault(p => t.Value >= p.StartAbs && (!p.EndAbs.HasValue || t.Value <= p.EndAbs.Value)) : null;

        verdict.Pills = new PillsInfo
        {
            Configured = periods.Count > 0,
            Active = activePillPeriod != null,
            CurrentType = activePillPeriod?.Type,
            Periods = periods,
            Covering = abs => periods.FirstOrDefault(p => abs >= p.StartAbs && (!p.EndAbs.HasValue || abs <= p.EndAbs.Value)),
            DaysBetween = (fromAbs, toAbs) => CountPillDays(periods, fromAbs, toAbs)
        };

        // Dormancy struct
        var startedWindows = !t.HasValue ? [] : windows.OrderBy(w => w.FromAbs).ToList();
        var activeWindow = !t.HasValue ? null : startedWindows.FirstOrDefault(w => !w.UntilAbs.HasValue || t.Value < w.UntilAbs.Value);
        bool hasOpenWindow = startedWindows.Any(w => !w.UntilAbs.HasValue);
        var endedWindows = !t.HasValue ? [] : startedWindows.Where(w => w.UntilAbs.HasValue && t.Value >= w.UntilAbs.Value).ToList();

        verdict.Dormancy = new DormancyInfo
        {
            Windows = startedWindows,
            ActiveWindow = activeWindow,
            Active = activeWindow != null,
            Ended = startedWindows.Count > 0 && activeWindow == null && !hasOpenWindow,
            Labels = startedWindows.Select(w => w.Label).ToList(),
            UpToAbs = activeWindow != null
                ? activeWindow.FromAbs
                : (endedWindows.Count > 0 && !hasOpenWindow ? endedWindows.Max(w => w.UntilAbs!.Value) : null),
            DisqualifiesEstablishment = (abs) =>
            {
                if (startedWindows.Count == 0) return false;
                if (abs <= startedWindows[0].FromAbs) return true;
                return startedWindows.Any(w => w.UntilAbs.HasValue && abs > w.FromAbs && abs < w.UntilAbs.Value);
            }
        };

        return verdict;
    }
}
