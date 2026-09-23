using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class EstablishedVeset
{
    public string Kind { get; set; } = string.Empty; // "month", "haflagah", "week", "mevucha", "dilug"
    public OnaType Ona { get; set; }
    public int? DayOfMonth { get; set; }
    public int? Span { get; set; }
    public int? SpanLabel { get; set; }
    public int? Weekday { get; set; }
    public string? WeekdayLabel { get; set; }
    public List<int> Days { get; set; } = [];
    public List<int> Cycle { get; set; } = [];
    public List<int> EstablishedBy { get; set; } = [];
    public bool Restored { get; set; }
    public string? RestoredFrom { get; set; }
    public int? RestoredFromAbs { get; set; }
    public int? RestoredAnchorAbs { get; set; }
    public string? Reason { get; set; }
    public string? Label { get; set; }
    public int? NextIndex { get; set; }
}

public sealed class ExcludedReiyah
{
    public int Abs { get; set; }
    public string Reason { get; set; } = string.Empty; // "ones", "continuation"
    public int? MergedInto { get; set; }
}

public sealed class ChazakaResult
{
    public List<ReiyahEvent> Counted { get; set; } = [];
    public List<ExcludedReiyah> Excluded { get; set; } = [];
    public List<EstablishedVeset> Established { get; set; } = [];
    public List<MixedOnaVerdict>? MixedOna { get; set; }

    /// <summary>The "tzeiruf lemafrea" candidate (stringency chiburLemafrea), for display and disclosure even when the toggle is off.</summary>
    public ChiburCandidate? Chibur { get; set; }

    /// <summary>Skip-pattern candidates (stringency dilug), always exposed so a rabbi can be consulted even when the toggle is off.</summary>
    public List<DilugCandidate> DilugCandidates { get; set; } = [];
}

public static class ChazakaManager
{
    public const int MonthSightingsNeeded = 3;
    public const int HaflagahSightingsNeeded = 4;
    public const int WeekSightingsNeeded = 3;

    public static (List<ReiyahEvent> Counted, List<ExcludedReiyah> Excluded) ClassifyReiyot(List<ReiyahEvent> reiyot, bool sharpFoodAsOnes = false)
    {
        var counted = new List<ReiyahEvent>();
        var excluded = new List<ExcludedReiyah>();

        for (int i = 0; i < reiyot.Count; i++)
        {
            var r = reiyot[i];

            if (r.Kind == "ones")
            {
                excluded.Add(new ExcludedReiyah
                {
                    Abs = r.Abs,
                    Reason = "ones",
                    MergedInto = null
                });
                continue;
            }

            // Stringency sharpFoodOnes: the dissenting view (the Gra"a) that a sighting caused
            // by sharp food is treated like an ones/jump - it does not count toward the chazaka
            // at all, rather than counting as a body-veset sign [SHT 27 p.41].
            if (r.Kind == "sharp" && sharpFoodAsOnes)
            {
                excluded.Add(new ExcludedReiyah
                {
                    Abs = r.Abs,
                    Reason = "sharp",
                    MergedInto = null
                });
                continue;
            }

            if (r.ClosedFountain == false)
            {
                int window = r.DurationDays.HasValue && r.DurationDays.Value > 1 ? r.DurationDays.Value - 1 : 1;
                ReiyahEvent? mergedTarget = null;

                for (int k = i - 1; k >= 0; k--)
                {
                    int gap = r.Abs - reiyot[k].Abs;
                    if (gap <= 0) continue;
                    if (gap <= window)
                    {
                        mergedTarget = reiyot[k];
                        break;
                    }
                    break;
                }

                if (mergedTarget != null)
                {
                    excluded.Add(new ExcludedReiyah
                    {
                        Abs = r.Abs,
                        Reason = "continuation",
                        MergedInto = mergedTarget.Abs
                    });
                    continue;
                }
            }

            counted.Add(r);
        }

        return (counted, excluded);
    }

    public static ChazakaResult AnalyzeChazaka(List<ReiyahEvent> reiyot, bool sharpFoodAsOnes = false)
    {
        var (counted, excluded) = ClassifyReiyot(reiyot, sharpFoodAsOnes);
        var result = new ChazakaResult
        {
            Counted = counted,
            Excluded = excluded
        };

        if (counted.Count == 0) return result;

        var lastCounted = counted[^1];

        // 1. Month Veset: 3 consecutive sightings on same Hebrew day and same onah
        int monthRun = 0;
        for (int i = counted.Count - 1; i >= 0; i--)
        {
            var r = counted[i];
            if (r.HDate.Day != lastCounted.HDate.Day || r.Ona != lastCounted.Ona) break;
            monthRun++;
        }

        if (monthRun >= MonthSightingsNeeded)
        {
            result.Established.Add(new EstablishedVeset
            {
                Kind = "month",
                Ona = lastCounted.Ona,
                DayOfMonth = lastCounted.HDate.Day,
                EstablishedBy = counted.Skip(counted.Count - MonthSightingsNeeded).Select(x => x.Abs).ToList()
            });
        }

        // 2. Haflagah Veset: 4 sightings with 3 equal spans and same onah
        if (counted.Count >= HaflagahSightingsNeeded)
        {
            int span = lastCounted.Abs - counted[^2].Abs;
            int spans = 0;
            for (int i = counted.Count - 1; i >= 1; i--)
            {
                if (counted[i].Abs - counted[i - 1].Abs != span) break;
                if (counted[i].Ona != lastCounted.Ona) break;
                spans++;
            }

            if (spans >= HaflagahSightingsNeeded - 1)
            {
                result.Established.Add(new EstablishedVeset
                {
                    Kind = "haflagah",
                    Ona = lastCounted.Ona,
                    Span = span,
                    SpanLabel = span + 1,
                    EstablishedBy = counted.Skip(counted.Count - HaflagahSightingsNeeded).Select(x => x.Abs).ToList()
                });
            }
        }

        // 3. Week Veset: 3 sightings on same weekday exactly 7 days apart and same onah
        if (counted.Count >= WeekSightingsNeeded)
        {
            int weekday = lastCounted.HDate.DayOfWeek;
            int weekRun = 0;
            for (int i = counted.Count - 1; i >= 0; i--)
            {
                var r = counted[i];
                if (r.HDate.DayOfWeek != weekday || r.Ona != lastCounted.Ona) break;
                if (weekRun > 0 && r.Abs != counted[i + 1].Abs - 7) break;
                weekRun++;
            }

            if (weekRun >= WeekSightingsNeeded)
            {
                var hebDays = new[] { "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת" };
                result.Established.Add(new EstablishedVeset
                {
                    Kind = "week",
                    Ona = lastCounted.Ona,
                    Weekday = weekday,
                    WeekdayLabel = hebDays[weekday],
                    EstablishedBy = counted.Skip(counted.Count - WeekSightingsNeeded).Select(x => x.Abs).ToList()
                });
            }
        }

        // 4. Mevucha Veset (ימים המתחלפים): 3 sightings on day A and 3 sightings on day B (gap of 2 days, middle day never seen)
        var mevucha = FindAlternatingDays(counted);
        if (mevucha != null)
        {
            result.Established.Add(mevucha);
        }

        // 5. Mixed Ona Change
        result.MixedOna = MixedOnaChange(counted);

        // 6. Tzeiruf lemafrea (stringency chiburLemafrea) - always detected and exposed for
        // disclosure; only counted as an actual veset when the toggle is on (VesetEngine).
        result.Chibur = DetectChiburLemafrea(counted);

        // 7. Skip-pattern (stringency dilug) - likewise always detected and exposed.
        result.DilugCandidates = VesetDilugManager.DetectDilugCandidates(counted);

        return result;
    }

    /// <summary>Trailing count of consecutive same-day-of-month, same-ona sightings at the end of the list (looking backward from the last element).</summary>
    private static int TrailingSameDayRun(List<ReiyahEvent> counted)
    {
        if (counted.Count == 0) return 0;
        var last = counted[^1];
        int run = 0;
        for (int i = counted.Count - 1; i >= 0; i--)
        {
            if (counted[i].HDate.Day != last.HDate.Day || counted[i].Ona != last.Ona) break;
            run++;
        }
        return run;
    }

    /// <summary>Trailing count of consecutive equal haflagah spans at the end of the list, provided the closing ona of each pair matches the last sighting's ona.</summary>
    private static (int Spans, int? Span) TrailingEqualSpans(List<ReiyahEvent> counted)
    {
        if (counted.Count < 2) return (0, null);
        var last = counted[^1];
        int span = last.Abs - counted[^2].Abs;
        int spans = 0;
        for (int i = counted.Count - 1; i >= 1; i--)
        {
            if (counted[i].Abs - counted[i - 1].Abs != span) break;
            if (counted[i].Ona != last.Ona) break;
            spans++;
        }
        return (spans, span);
    }

    /// <summary>
    /// "עונות מעורבות" - a pattern (month day-of-month, or haflagah span) completed by three
    /// (month) or four (haflagah) sightings in one onah, with the closing sighting landing in
    /// the OPPOSITE onah - "חוששת ביום ובלילה" `[שט ל"ג | עמ' 112]`. Both kinds are detected
    /// independently; a single counted list can produce both a month and a haflagah verdict.
    /// </summary>
    public static List<MixedOnaVerdict>? MixedOnaChange(List<ReiyahEvent> counted)
    {
        if (counted == null || counted.Count < MonthSightingsNeeded + 1) return null;
        var last = counted[^1];
        var previous = counted.Take(counted.Count - 1).ToList();
        var outList = new List<MixedOnaVerdict>();

        // וסת החודש: שלש ראיות באותו יום בחודש ובעונה אחת, והרביעית באותו יום בעונה שכנגד.
        int previousMonthRun = TrailingSameDayRun(previous);
        if (previousMonthRun >= MonthSightingsNeeded)
        {
            var previousLast = previous[^1];
            if (last.HDate.Day == previousLast.HDate.Day && last.Ona != previousLast.Ona)
            {
                outList.Add(new MixedOnaVerdict
                {
                    Kind = "month",
                    DayOfMonth = last.HDate.Day,
                    FirstOna = previousLast.Ona,
                    LastOna = last.Ona,
                    LastAbs = last.Abs,
                    EstablishedBy = previous.TakeLast(MonthSightingsNeeded).Select(r => r.Abs).ToList()
                });
            }
        }

        // וסת ההפלגה: ד' ראיות בג' הפלגות שוות בעונה אחת, והחמישית באותה הפלגה בעונה שכנגד.
        var (previousSpansCount, previousSpan) = TrailingEqualSpans(previous);
        if (previousSpan.HasValue && previousSpansCount >= HaflagahSightingsNeeded - 1)
        {
            var previousLast = previous[^1];
            int span = last.Abs - previousLast.Abs;
            if (span == previousSpan.Value && last.Ona != previousLast.Ona)
            {
                outList.Add(new MixedOnaVerdict
                {
                    Kind = "haflagah",
                    Span = span,
                    SpanLabel = span + 1,
                    FirstOna = previousLast.Ona,
                    LastOna = last.Ona,
                    LastAbs = last.Abs,
                    EstablishedBy = previous.TakeLast(HaflagahSightingsNeeded).Select(r => r.Abs).ToList()
                });
            }
        }

        return outList.Count > 0 ? outList : null;
    }

    public static EstablishedVeset? FindAlternatingDays(List<ReiyahEvent> counted)
    {
        var list = (counted ?? []).ToList();
        if (list.Count < 6) return null;
        var last = list[^1];

        var allDays = new HashSet<int>(list.Select(r => r.HDate.Day));
        var byDay = new Dictionary<int, List<ReiyahEvent>>();

        foreach (var r in list.Where(r => r.Ona == last.Ona))
        {
            int day = r.HDate.Day;
            if (!byDay.TryGetValue(day, out var dayList))
            {
                dayList = [];
                byDay[day] = dayList;
            }
            dayList.Add(r);
        }

        var days = byDay.Keys.OrderBy(x => x).ToList();
        if (days.Count != 2) return null;

        int a = days[0];
        int b = days[1];
        if (b - a != 2) return null;
        if (allDays.Contains(a + 1)) return null;
        if (byDay[a].Count < 3 || byDay[b].Count < 3) return null;

        var establishedBy = byDay[a].TakeLast(3).Select(r => r.Abs)
            .Concat(byDay[b].TakeLast(3).Select(r => r.Abs))
            .OrderBy(x => x).ToList();

        return new EstablishedVeset
        {
            Kind = "mevucha",
            Ona = last.Ona,
            Days = [a, b],
            EstablishedBy = establishedBy
        };
    }

    public static ChiburCandidate? DetectChiburLemafrea(List<ReiyahEvent> counted)
    {
        if (counted == null || counted.Count < HaflagahSightingsNeeded) return null;
        var last = counted[^1];
        int span = last.Abs - counted[^2].Abs;
        if (span <= 0) return null;

        int equalSpans = 1;
        var gapSpans = new List<int>();
        int windowStart = counted.Count - 1;

        for (int i = counted.Count - 2; i >= 1; i--)
        {
            int s = counted[i].Abs - counted[i - 1].Abs;
            if (s == span)
            {
                equalSpans++;
                windowStart = i - 1;
                if (equalSpans >= HaflagahSightingsNeeded - 1) break;
            }
            else if (s < span)
            {
                gapSpans.Insert(0, s);
            }
            else
            {
                return null;
            }
        }

        if (equalSpans < HaflagahSightingsNeeded - 1 || gapSpans.Count == 0) return null;

        var windowSightings = counted.Skip(windowStart).ToList();
        var ona = last.Ona;
        if (windowSightings.Any(r => r.Ona != ona)) return null;

        return new ChiburCandidate
        {
            Kind = "haflagah",
            Ona = ona,
            Span = span,
            SpanLabel = span + 1,
            ViaChibur = true,
            EstablishedBy = windowSightings.Select(r => r.Abs).ToList(),
            GapSpans = gapSpans
        };
    }

    public static string HebDayOfMonth(int day)
    {
        string[] names = ["", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'", "י'",
            "י\"א", "י\"ב", "י\"ג", "י\"ד", "ט\"ו", "ט\"ז", "י\"ז", "י\"ח", "י\"ט", "כ'", "כ\"א", "כ\"ב",
            "כ\"ג", "כ\"ד", "כ\"ה", "כ\"ו", "כ\"ז", "כ\"ח", "כ\"ט", "ל'"];
        return (day >= 0 && day < names.Length && !string.IsNullOrEmpty(names[day])) ? names[day] : day.ToString();
    }

    public static string DescribeVeset(EstablishedVeset veset)
    {
        string onaText = veset.Ona == OnaType.Night ? "עונת לילה" : "עונת יום";
        if (veset.Kind == "month")
        {
            return $"וסת קבוע ליום {HebDayOfMonth(veset.DayOfMonth ?? 1)} בחודש ({onaText})";
        }
        if (veset.Kind == "week")
        {
            return $"וסת קבוע ליום {veset.WeekdayLabel ?? "ראשון"} בשבוע ({onaText})";
        }
        if (veset.Kind == "mevucha")
        {
            var days = string.Join(" ויום ", (veset.Days ?? []).Select(HebDayOfMonth));
            return $"וסת קבוע לימים המתחלפים: יום {days} בחודש ({onaText})";
        }
        if (veset.Kind == "dilug")
        {
            var cycle = string.Join(" ← ", (veset.Cycle ?? []).Select(HebDayOfMonth));
            return $"וסת קבוע לדילוג — מחזור {cycle} ({onaText})";
        }
        return $"וסת קבוע להפלגת {veset.SpanLabel ?? (veset.Span + 1)} ימים ({onaText})";
    }
}


