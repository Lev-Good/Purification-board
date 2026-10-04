using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class DilugCandidate
{
    public string Kind { get; set; } = "dilug";
    public List<int> Cycle { get; set; } = [];
    public OnaType Ona { get; set; }
    public int CycleIndex { get; set; }
    public int NextIndex { get; set; }
    public int AnchorAbs { get; set; }
    public string Label { get; set; } = string.Empty;
    public List<int> EstablishedBy { get; set; } = [];
}

public static class VesetDilugManager
{
    public const string DilugCode = "וק\"ד";
    public static readonly int[] DilugCycleLengths = [2, 3];
    public const int DilugMinCycles = 2;

    public static int MonthStartAfter(int abs)
    {
        int month = new HDate(abs).Month;
        int k = 1;
        while (new HDate(abs + k).Month == month && k < 40) k++;
        return abs + k;
    }

    public static int MonthStartBefore(int abs)
    {
        int month = new HDate(abs).Month;
        int k = 1;
        while (new HDate(abs - k).Month == month && k < 40) k++;
        return abs - k + 1;
    }

    public static bool MonthsAreConsecutive(int prevAbs, int nextAbs)
    {
        return MonthStartAfter(prevAbs) == MonthStartBefore(nextAbs);
    }

    private static bool IsRisingCycle(List<int> days, int p)
    {
        if (days.Count < p * DilugMinCycles) return false;
        for (int i = p; i < days.Count; i++)
        {
            if (days[i] != days[i - p]) return false;
        }
        var cycle = days.Take(p).ToList();
        for (int i = 1; i < p; i++)
        {
            if (cycle[i] != cycle[i - 1] + 1) return false;
        }
        return cycle[0] != cycle[p - 1];
    }

    /// <summary>The day-of-month to watch for a given month index in the dilug cycle (0-based from nextIndex). Mirrors js/vesetDilug.js dilugDayFor.</summary>
    public static int? DilugDayFor(DilugCandidate candidate, int index)
    {
        var cycle = candidate?.Cycle ?? [];
        if (cycle.Count == 0) return null;
        int i = ((candidate!.NextIndex + index) % cycle.Count + cycle.Count) % cycle.Count;
        return cycle[i];
    }

    public static List<DilugCandidate> DetectDilugCandidates(List<ReiyahEvent> counted)
    {
        var list = (counted ?? []).ToList();
        if (list.Count < 2 * DilugMinCycles) return [];

        var tail = new List<ReiyahEvent>();
        for (int i = list.Count - 1; i >= 0; i--)
        {
            var current = list[i];
            if (tail.Count == 0)
            {
                tail.Insert(0, current);
                continue;
            }
            var first = tail[0];
            if (current.Ona != first.Ona) break;
            if (!MonthsAreConsecutive(current.Abs, first.Abs)) break;
            tail.Insert(0, current);
        }

        if (tail.Count < 2 * DilugMinCycles) return [];

        var days = tail.Select(r => r.HDate.Day).ToList();
        var anchor = tail[^1];

        var results = new List<DilugCandidate>();
        foreach (var p in DilugCycleLengths)
        {
            if (IsRisingCycle(days, p))
            {
                var cycle = days.Take(p).ToList();
                int establishedCount = p * DilugMinCycles;
                results.Add(new DilugCandidate
                {
                    Kind = "dilug",
                    Cycle = cycle,
                    Ona = anchor.Ona,
                    CycleIndex = (tail.Count - 1) % p,
                    NextIndex = tail.Count % p,
                    AnchorAbs = anchor.Abs,
                    Label = $"מחזור {string.Join("–", cycle.Select(x => HDate.ToGematriya(x)))}",
                    EstablishedBy = tail.Skip(tail.Count - establishedCount).Select(r => r.Abs).ToList()
                });
            }
        }

        return results;
    }
}
