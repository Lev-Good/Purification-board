using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

/// <summary>
/// A "veset sirug" (וסת הסירוג) candidate - the same day-of-month and ona repeating with a
/// fixed number of skipped months between each sighting (e.g. once every two months), as
/// distinct from וסת הדילוג (VesetDilugManager) where the day itself advances each cycle.
/// Ports הלכות טהרה הר"ע פריד פרק כז חלק ד (עמ' 96): "ראתה באותו תאריך ובאותה עונה בדילוג
/// של חודש באופן קבוע, קבעה לה וסת לאותו תאריך" - example: א' ניסן, א' סיון, א' אב (כולם
/// עונת יום) - קבעה וסת הסירוג לא' בחודש, פעם בחודשיים (חודש מדולג ביניהם).
/// </summary>
public sealed class SirugCandidate
{
    public string Kind { get; set; } = "sirug";
    public int Day { get; set; }
    public OnaType Ona { get; set; }
    /// <summary>Hebrew months between one sighting and the next (2 = every other month, i.e. one month skipped).</summary>
    public int MonthInterval { get; set; }
    public List<int> EstablishedBy { get; set; } = [];
    public string Label { get; set; } = string.Empty;
}

public static class VesetSirugManager
{
    public const int SirugSightingsNeeded = 3;
    /// <summary>Book's own example skips exactly one month (interval of 2); allow 2 or 3 for a slightly wider net, matching the "דילוג של חודש באופן קבוע" phrasing without over-fitting to a single example.</summary>
    public static readonly int[] MonthIntervals = [2, 3];

    /// <summary>How many Hebrew months after fromAbs's month toAbs's month falls (1 = the immediately next month). Walks month-starts via VesetDilugManager.MonthStartAfter, which is itself Hebrew-leap-year-safe (built directly on HDate.Month boundaries). Returns -1 if toAbs is not strictly later or not found within a year and a half.</summary>
    private static int MonthsAfter(int fromAbs, int toAbs)
    {
        if (toAbs <= fromAbs) return -1;
        var target = new HDate(toAbs);
        int cursor = fromAbs;
        for (int count = 1; count <= 18; count++)
        {
            cursor = VesetDilugManager.MonthStartAfter(cursor);
            var cursorDate = new HDate(cursor);
            if (cursorDate.Month == target.Month && cursorDate.Year == target.Year) return count;
        }
        return -1;
    }

    public static List<SirugCandidate> DetectSirugCandidates(List<ReiyahEvent> counted)
    {
        var list = (counted ?? []).OrderBy(r => r.Abs).ToList();
        if (list.Count < SirugSightingsNeeded) return [];

        var last = list[^1];
        int day = last.HDate.Day;
        var ona = last.Ona;

        var results = new List<SirugCandidate>();
        foreach (var interval in MonthIntervals)
        {
            var tail = new List<ReiyahEvent> { last };
            for (int i = list.Count - 2; i >= 0; i--)
            {
                var candidate = list[i];
                if (candidate.HDate.Day != day || candidate.Ona != ona) break;
                if (MonthsAfter(candidate.Abs, tail[0].Abs) != interval) break;
                tail.Insert(0, candidate);
            }

            if (tail.Count >= SirugSightingsNeeded)
            {
                string monthLabel = interval == 2 ? "פעם בחודשיים" : $"פעם ב-{interval} חודשים";
                results.Add(new SirugCandidate
                {
                    Kind = "sirug",
                    Day = day,
                    Ona = ona,
                    MonthInterval = interval,
                    EstablishedBy = tail.TakeLast(SirugSightingsNeeded).Select(r => r.Abs).ToList(),
                    Label = $"וסת הסירוג ליום {ChazakaManager.HebDayOfMonth(day)} בחודש, {monthLabel} ({(ona == OnaType.Night ? "עונת לילה" : "עונת יום")})"
                });
            }
        }

        return results;
    }
}
