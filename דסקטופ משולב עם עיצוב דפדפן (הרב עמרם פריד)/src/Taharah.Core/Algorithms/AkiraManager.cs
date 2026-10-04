using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class CheckRecord
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public string Depth { get; set; } = "deep";
    public string? Part { get; set; }
    public bool Twice { get; set; }
}

public static class CheckDepthLabels
{
    public const string Deep = "בדיקה כדין (עומק ובחו\"ס)";
    public const string Wipe = "קינוח בלבד";

    public static string LabelOf(string? depth) => depth == "wipe" ? Wipe : Deep;
}

/// <summary>A single due time of a fixed veset, and what happened to it (seen / checked / pending / stain / upcoming).</summary>
public sealed class DueTimeStatus
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // seen | upcoming | stain | checked | pending
    public int? CheckAbs { get; set; }
    public int? StainAbs { get; set; }
}

/// <summary>Uprooting a haflagah veset by day-count alone (no check needed) - periodsToClear(span) = span*3-2.</summary>
public sealed class IntervalInfo
{
    public int Needed { get; set; }
    public int Passed { get; set; }
    public int Elapsed { get; set; }
    public int Skipped { get; set; }
    public bool Met { get; set; }
}

public sealed class FixedVesetStatus
{
    public EstablishedVeset Veset { get; set; } = null!;
    public bool Cleared { get; set; }
    public string? ClearedBy { get; set; } // "checks" | "interval"
    public int? ClearedAtAbs { get; set; }
    public int ClearedCount { get; set; }
    public int Needed { get; set; }
    public IntervalInfo? Interval { get; set; }
    public List<DueTimeStatus> DueTimes { get; set; } = [];
    public List<DueTimeStatus> Pending { get; set; } = [];
    public int? NextDue { get; set; }
}

public sealed class PendingCheckEntry
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string? Kind { get; set; }
}

/// <summary>A returned-to-pattern sighting after a fixed veset was uprooted - the (undecided) "return of the veset" dispute.</summary>
public sealed class ReturnDisputeEntry
{
    public EstablishedVeset Veset { get; set; } = null!;
    public List<int> Sightings { get; set; } = [];
    public int? ClearedAtAbs { get; set; }
}

public sealed class AkirotResult
{
    public List<FixedVesetStatus> Fixed { get; set; } = [];
    public List<FixedVesetStatus> Active { get; set; } = [];
    public List<FixedVesetStatus> Uprooted { get; set; } = [];
    public List<PendingCheckEntry> PendingChecks { get; set; } = [];
    public List<ReturnDisputeEntry> ReturnDispute { get; set; } = [];
}

public sealed class AkirotParams
{
    public List<ReiyahEvent> Reiyot { get; set; } = [];
    public List<EstablishedVeset> Established { get; set; } = [];
    public ReiyahEvent? LastCounted { get; set; }
    public List<CheckRecord> Checks { get; set; } = [];
    public int Today { get; set; }

    /// <summary>Projects the due times of a veset from an anchor sighting (mirrors VesetEngine.ProjectFixedVeset).</summary>
    public Func<EstablishedVeset, ReiyahEvent, List<(int Abs, OnaType Ona, string Code)>> Project { get; set; } = null!;

    /// <summary>The anchor of a veset when it is not simply the last counted sighting (a veset restored from a dormancy anchors at the dormancy's end).</summary>
    public Func<EstablishedVeset, ReiyahEvent?>? AnchorOf { get; set; }

    /// <summary>How many days of a [fromAbs, toAbs] span were spent taking pills - those days are not counted toward haflagah-uprooting.</summary>
    public Func<int, int, int>? PillsDays { get; set; }

    public Func<ReiyahEvent, bool>? IsPillSighting { get; set; }

    /// <summary>Stringency `lateBedika` - default true: a check made after the due day still counts (the Beit Yosef). false = only a same-day check counts.</summary>
    public bool? LateBedika { get; set; }

    public HashSet<int>? StainAbs { get; set; }

    /// <summary>Stringency `stainUproots` - the Sha'arei Tohar view that a stain found on a due time counts as an uprooting check.</summary>
    public bool StainUproots { get; set; }
}

public static class AkiraManager
{
    /// <summary>How many consecutive veset times (with a proper check) are needed to uproot a fixed veset.</summary>
    public const int ClearingTimesNeeded = 3;

    public static List<string> CheckPartsOf(IEnumerable<string>? parts)
    {
        if (parts == null) return [];
        var outList = new List<string>();
        foreach (var p in parts)
        {
            if (!string.IsNullOrEmpty(p) && !outList.Contains(p))
                outList.Add(p);
        }
        return outList;
    }

    public static int CheckCountOf(bool isCheck, bool twice, List<string>? parts)
    {
        if (!isCheck) return 0;
        var pList = CheckPartsOf(parts);
        if (pList.Count > 0) return pList.Count;
        return twice ? 2 : 1;
    }

    public static List<CheckRecord> ExtractChecks(Dictionary<int, (string Type, OnaType Ona, string Depth, bool Twice, List<string>? Parts)> db)
    {
        var checks = new List<CheckRecord>();
        foreach (var (abs, entry) in db.OrderBy(x => x.Key))
        {
            if (entry.Type != "check") continue;
            var parts = CheckPartsOf(entry.Parts);
            if (parts.Count > 0)
            {
                foreach (var part in parts)
                {
                    checks.Add(new CheckRecord
                    {
                        Abs = abs,
                        Ona = entry.Ona,
                        Depth = entry.Depth,
                        Part = part,
                        Twice = true
                    });
                }
            }
            else
            {
                checks.Add(new CheckRecord
                {
                    Abs = abs,
                    Ona = entry.Ona,
                    Depth = entry.Depth,
                    Twice = entry.Twice
                });
            }
        }
        return checks;
    }

    /// <summary>Extracts check records straight from the calendar day database (the shape VesetEngine actually stores).</summary>
    public static List<CheckRecord> ExtractChecks(Dictionary<int, VesetEngine.CalendarDayEntry> db)
    {
        var checks = new List<CheckRecord>();
        foreach (var (abs, entry) in db.OrderBy(x => x.Key))
        {
            if (entry.Type != "check") continue;
            var parts = CheckPartsOf(entry.CheckParts);
            string depth = entry.Depth == "wipe" ? "wipe" : "deep";
            if (parts.Count > 0)
            {
                foreach (var part in parts)
                {
                    checks.Add(new CheckRecord { Abs = abs, Ona = entry.Ona, Depth = depth, Part = part, Twice = true });
                }
            }
            else
            {
                checks.Add(new CheckRecord { Abs = abs, Ona = entry.Ona, Depth = depth, Twice = entry.Twice ?? false });
            }
        }
        return checks;
    }

    public static int PeriodsToClear(int span) => span * 3 - 2;

    /// <summary>A non-fixed veset's due time that passed without a sighting is uprooted immediately [SHT 33 p.111].</summary>
    public static bool IsConcernUprooted(int concernAbs, List<ReiyahEvent> sightings, int today)
    {
        if (concernAbs >= today) return false;
        return !sightings.Any(r => r.Abs == concernAbs);
    }

    private static IEnumerable<ReiyahEvent> NaturalSightings(IEnumerable<ReiyahEvent> list, Func<ReiyahEvent, bool> isPillSighting)
        => list.Where(r => !isPillSighting(r));

    /// <summary>Is there a proper (deep) check covering a given veset due time - made on/after it, before the next due time, with no sighting in between.</summary>
    private static CheckRecord? FindCoveringCheck(int dueAbs, OnaType dueOna, List<CheckRecord> checks, int nextDueAbs, HashSet<int> sightingAbs, bool requireSameDay)
    {
        foreach (var check in checks)
        {
            if (check.Depth != "deep") continue;
            if (check.Abs < dueAbs) continue;
            if (check.Abs >= nextDueAbs) break;
            if (requireSameDay && check.Abs != dueAbs) continue;
            if (check.Abs == dueAbs && check.Ona != dueOna) continue;

            bool interrupted = false;
            for (int abs = dueAbs + 1; abs <= check.Abs; abs++)
            {
                if (sightingAbs.Contains(abs)) { interrupted = true; break; }
            }
            if (!interrupted) return check;
        }
        return null;
    }

    private sealed class DueTimeCandidate
    {
        public int Abs;
        public OnaType Ona;
        public string Code = string.Empty;
    }

    private static (List<DueTimeStatus> Statuses, int? ClearedAtAbs, int ClearedCount) EvaluateDueTimes(
        List<DueTimeCandidate> dueTimes, List<CheckRecord> checks, HashSet<int> sightingAbs, int today,
        bool requireSameDay, HashSet<int>? stainAbs, bool stainUproots)
    {
        var statuses = new List<DueTimeStatus>();
        int clearedCount = 0;
        int? clearedAtAbs = null;
        var stains = stainAbs ?? [];

        for (int i = 0; i < dueTimes.Count; i++)
        {
            var due = dueTimes[i];
            int nextAbs = i + 1 < dueTimes.Count ? dueTimes[i + 1].Abs : int.MaxValue;

            if (sightingAbs.Contains(due.Abs))
            {
                statuses.Add(new DueTimeStatus { Abs = due.Abs, Ona = due.Ona, Code = due.Code, Status = "seen" });
                clearedCount = 0;
                continue;
            }

            if (due.Abs >= today)
            {
                statuses.Add(new DueTimeStatus { Abs = due.Abs, Ona = due.Ona, Code = due.Code, Status = "upcoming" });
                break;
            }

            if (stainUproots && stains.Contains(due.Abs))
            {
                clearedCount++;
                if (clearedCount >= ClearingTimesNeeded && clearedAtAbs == null) clearedAtAbs = due.Abs;
                statuses.Add(new DueTimeStatus { Abs = due.Abs, Ona = due.Ona, Code = due.Code, Status = "stain", StainAbs = due.Abs });
                continue;
            }

            var check = FindCoveringCheck(due.Abs, due.Ona, checks, nextAbs, sightingAbs, requireSameDay);
            if (check != null)
            {
                clearedCount++;
                if (clearedCount >= ClearingTimesNeeded && clearedAtAbs == null) clearedAtAbs = due.Abs;
                statuses.Add(new DueTimeStatus { Abs = due.Abs, Ona = due.Ona, Code = due.Code, Status = "checked", CheckAbs = check.Abs });
            }
            else
            {
                clearedCount = 0;
                statuses.Add(new DueTimeStatus { Abs = due.Abs, Ona = due.Ona, Code = due.Code, Status = "pending" });
            }
        }

        return (statuses, clearedAtAbs, clearedCount);
    }

    /// <summary>The sightings that match an uprooted veset's own pattern from the uprooting date on - these raise the (undecided) "return of the veset" dispute.</summary>
    private static List<int> SightingsMatchingVeset(EstablishedVeset veset, List<ReiyahEvent> reiyot, int sinceAbs, Func<ReiyahEvent, bool> isPillSighting)
    {
        var counted = reiyot.Where(r => r.Counted && !isPillSighting(r)).ToList();
        var outList = new List<int>();

        if (veset.Kind == "month")
        {
            foreach (var r in counted)
                if (r.Abs > sinceAbs && r.HDate.Day == veset.DayOfMonth && r.Ona == veset.Ona)
                    outList.Add(r.Abs);
            return outList;
        }

        if (veset.Kind == "week")
        {
            foreach (var r in counted)
                if (r.Abs > sinceAbs && r.HDate.DayOfWeek == veset.Weekday && r.Ona == veset.Ona)
                    outList.Add(r.Abs);
            return outList;
        }

        if (veset.Kind == "dilug")
        {
            var cycle = veset.Cycle ?? [];
            if (cycle.Count == 0) return outList;
            foreach (var r in counted)
            {
                if (r.Abs <= sinceAbs || r.Ona != veset.Ona) continue;
                if (cycle.Contains(r.HDate.Day)) outList.Add(r.Abs);
            }
            return outList;
        }

        if (veset.Kind == "mevucha")
        {
            var days = veset.Days ?? [];
            foreach (var r in counted)
                if (r.Abs > sinceAbs && days.Contains(r.HDate.Day) && r.Ona == veset.Ona)
                    outList.Add(r.Abs);
            return outList;
        }

        for (int i = 1; i < counted.Count; i++)
        {
            int gap = counted[i].Abs - counted[i - 1].Abs;
            if (counted[i].Abs > sinceAbs && gap == veset.Span && counted[i].Ona == veset.Ona)
                outList.Add(counted[i].Abs);
        }
        return outList;
    }

    private static List<PendingCheckEntry> PendingFromFixed(List<FixedVesetStatus> fixedList)
    {
        var outList = new List<PendingCheckEntry>();
        foreach (var f in fixedList.Where(f => !f.Cleared))
        {
            foreach (var p in f.Pending)
            {
                outList.Add(new PendingCheckEntry
                {
                    Abs = p.Abs,
                    Ona = p.Ona,
                    Code = p.Code,
                    Reason = "עבר זמן הוסת הקבועה (" + p.Code + ") ולא נבדקה בדיקה כדין - יש לבדוק, שכן בלא בדיקה לא נעקר הוסת והאישה אסורה לבעלה עד שתבדק"
                });
            }
        }
        return outList;
    }

    /// <summary>
    /// Analyzes every established fixed veset and determines which of them has been uprooted.
    /// A fixed veset needs three consecutive due times, each covered by a proper (deep) check,
    /// or - for a haflagah veset - the mere passage of periodsToClear(span) days without a
    /// sighting. Ports js/akira.js `analyzeAkirot` faithfully.
    /// </summary>
    public static AkirotResult AnalyzeAkirot(AkirotParams p)
    {
        bool requireSameDay = p.LateBedika == false;
        var list = p.Reiyot ?? [];
        var pillSighting = p.IsPillSighting ?? (_ => false);
        var pillDaysIn = p.PillsDays ?? ((_, _) => 0);
        var sightingAbs = new HashSet<int>(list.Select(r => r.Abs));
        var sortedChecks = (p.Checks ?? []).OrderBy(c => c.Abs).ToList();
        bool HasSightingAfter(int abs) => NaturalSightings(list, pillSighting).Any(r => r.Abs > abs);

        var fixedList = new List<FixedVesetStatus>();
        var returnDispute = new List<ReturnDisputeEntry>();

        foreach (var veset in p.Established ?? [])
        {
            var anchor = p.AnchorOf?.Invoke(veset) ?? p.LastCounted;
            var dueTimes = new List<DueTimeCandidate>();
            if (anchor != null)
            {
                var projected = p.Project(veset, anchor) ?? [];
                foreach (var e in projected)
                    dueTimes.Add(new DueTimeCandidate { Abs = e.Abs, Ona = e.Ona, Code = e.Code });
            }

            var (statuses, checkedAtAbs, clearedCount) = EvaluateDueTimes(
                dueTimes, sortedChecks, sightingAbs, p.Today, requireSameDay, p.StainAbs, p.StainUproots);

            IntervalInfo? interval = null;
            if (veset.Kind == "haflagah" && anchor != null && !HasSightingAfter(anchor.Abs))
            {
                int needed = PeriodsToClear(veset.Span ?? 0);
                int elapsed = p.Today - anchor.Abs;
                int skipped = Math.Min(elapsed, Math.Max(0, pillDaysIn(anchor.Abs + 1, p.Today)));
                int passed = elapsed - skipped;
                interval = new IntervalInfo { Needed = needed, Passed = passed, Elapsed = elapsed, Skipped = skipped, Met = passed >= needed };
            }

            string? clearedBy = null;
            int? clearedAtAbs = checkedAtAbs;
            if (checkedAtAbs != null)
            {
                clearedBy = "checks";
            }
            else if (interval != null && interval.Met)
            {
                clearedBy = "interval";
                clearedAtAbs = anchor!.Abs + interval.Needed;
            }

            var status = new FixedVesetStatus
            {
                Veset = veset,
                Cleared = clearedBy != null,
                ClearedBy = clearedBy,
                ClearedAtAbs = clearedAtAbs,
                ClearedCount = clearedCount,
                Needed = ClearingTimesNeeded,
                Interval = interval,
                DueTimes = statuses,
                Pending = statuses.Where(s => s.Status == "pending").ToList(),
                NextDue = statuses.FirstOrDefault(s => s.Status == "upcoming")?.Abs
            };
            fixedList.Add(status);

            if (clearedBy != null)
            {
                var matching = SightingsMatchingVeset(veset, list, clearedAtAbs!.Value, pillSighting);
                if (matching.Count > 0 && matching.Count < ClearingTimesNeeded)
                {
                    returnDispute.Add(new ReturnDisputeEntry { Veset = veset, Sightings = matching, ClearedAtAbs = clearedAtAbs });
                }
            }
        }

        return new AkirotResult
        {
            Fixed = fixedList,
            Active = fixedList.Where(f => !f.Cleared).ToList(),
            Uprooted = fixedList.Where(f => f.Cleared).ToList(),
            PendingChecks = PendingFromFixed(fixedList),
            ReturnDispute = returnDispute
        };
    }

    /// <summary>Was a (non-fixed) veset time actually clarified by a proper check - the minority view that even a non-fixed veset needs a check to be uprooted, toggle `checkUprootNonFixed`.</summary>
    public static bool IsConcernClarified(Dictionary<int, List<PrishahEntry>> prishotMap, int concernAbs, OnaType concernOna, string concernCode, List<ReiyahEvent> reiyot, List<CheckRecord> checks, bool? lateBedika)
    {
        bool requireSameDay = lateBedika == false;
        var sightingAbs = new HashSet<int>((reiyot ?? []).Select(r => r.Abs));
        var sortedChecks = (checks ?? []).OrderBy(c => c.Abs).ToList();
        var sameCode = new List<int>();
        var map = prishotMap ?? [];
        foreach (var abs in map.Keys.OrderBy(x => x))
        {
            foreach (var p in map[abs])
            {
                if (p.Code == concernCode) sameCode.Add(abs);
            }
        }
        int nextAbs = sameCode.FirstOrDefault(a => a > concernAbs, int.MaxValue);
        return FindCoveringCheck(concernAbs, concernOna, sortedChecks, nextAbs, sightingAbs, requireSameDay) != null;
    }

    /// <summary>Veset times (fixed or ordinary) that passed without a sighting AND without a proper check - "forbidden to her husband until she checks".</summary>
    public static List<PendingCheckEntry> FindPendingChecks(Dictionary<int, List<PrishahEntry>> prishotMap, List<ReiyahEvent> reiyot, List<CheckRecord> checks, int today, bool? lateBedika)
    {
        bool requireSameDay = lateBedika == false;
        var sightingAbs = new HashSet<int>((reiyot ?? []).Select(r => r.Abs));
        var sortedChecks = (checks ?? []).OrderBy(c => c.Abs).ToList();
        var seen = new HashSet<string>();
        var outList = new List<PendingCheckEntry>();
        var map = prishotMap ?? [];

        var byCode = new Dictionary<string, List<int>>();
        foreach (var abs in map.Keys.OrderBy(x => x))
        {
            foreach (var p in map[abs])
            {
                if (!byCode.TryGetValue(p.Code, out var l)) { l = []; byCode[p.Code] = l; }
                l.Add(abs);
            }
        }

        foreach (var abs in map.Keys.OrderBy(x => x))
        {
            if (abs >= today) continue;
            if (sightingAbs.Contains(abs)) continue;

            foreach (var p in map[abs])
            {
                string key = abs + "|" + p.Ona;
                if (seen.Contains(key)) continue;
                var sameCode = byCode.TryGetValue(p.Code, out var sc) ? sc : [];
                int nextAbs = sameCode.FirstOrDefault(a => a > abs, int.MaxValue);
                if (FindCoveringCheck(abs, p.Ona, sortedChecks, nextAbs, sightingAbs, requireSameDay) != null) continue;
                seen.Add(key);
                outList.Add(new PendingCheckEntry
                {
                    Abs = abs,
                    Ona = p.Ona,
                    Code = p.Code,
                    Reason = "עבר זמן הוסת (" + p.Reason + ") ולא נבדקה בדיקה כדין - יש לבדוק, שכן בלא בדיקה לא נברר שלא ראתה"
                });
            }
        }

        return outList;
    }
}

