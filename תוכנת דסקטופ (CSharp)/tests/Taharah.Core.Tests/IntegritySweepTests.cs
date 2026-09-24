using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class IntegritySweepTests
{
    private static int MonthStartAfter(int abs)
    {
        int baseMonth = new HDate(abs).Month;
        int k = 1;
        while (new HDate(abs + k).Month == baseMonth)
        {
            k++;
            if (k > 40) throw new InvalidOperationException("Month walk failed");
        }
        return abs + k;
    }

    private static (int? Single, List<int>? Disputed) ExpectedYomHachodesh(int baseAbs, int dayOfMonth)
    {
        int nextStart = MonthStartAfter(baseAbs);
        int nextLen = MonthStartAfter(nextStart) - nextStart;
        if (dayOfMonth <= nextLen)
        {
            return (nextStart + (dayOfMonth - 1), null);
        }

        int shortLast = nextStart + nextLen - 1;
        int mStart = nextStart;
        int? later30 = null;
        for (int i = 0; i < 6; i++)
        {
            int len = MonthStartAfter(mStart) - mStart;
            if (len == 30) { later30 = mStart + 29; break; }
            mStart = MonthStartAfter(mStart);
        }

        // "א' בחודש הבא בתורת ראש חודש" is 1st of the month AFTER the deficient one (nextStart),
        // not 1st of nextStart itself - see VesetEngine.GetYomHachodeshInfo's fix comment
        // (halachic edge-case audit, 2026-09-24). 1st of the deficient month would fall BEFORE
        // even the 29th-of-that-month entry, which cannot be a candidate "day 30 surrogate".
        int afterDeficientStart = MonthStartAfter(nextStart);
        var disputed = new List<int> { shortLast, afterDeficientStart };
        if (later30.HasValue) disputed.Add(later30.Value);
        disputed.Sort();
        return (null, disputed);
    }

    [Fact]
    public void EngineSweep_16HebrewYears_MatchesIndependentDerivation()
    {
        int swept = 0;
        for (int year = 5780; year <= 5795; year++)
        {
            int months = HDate.MonthsInYear(year);
            for (int month = 1; month <= months; month++)
            {
                int monthDays = HDate.DaysInMonth(month, year);
                foreach (int day in new[] { 1, 15, monthDays })
                {
                    int baseAbs = new HDate(day, month, year).Abs();
                    var db = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
                    {
                        [baseAbs] = ("reiyah", OnaType.Day, null)
                    };

                    var result = CalculateEngine(db, false);

                    var plainYh = result.Prishot
                        .Where(kv => kv.Value.Any(p => p.Code == "יו\"ח"))
                        .Select(kv => kv.Key)
                        .OrderBy(x => x)
                        .ToList();

                    var disputedYh = result.Prishot
                        .Where(kv => kv.Value.Any(p => p.Code == "יו\"ח*"))
                        .Select(kv => kv.Key)
                        .OrderBy(x => x)
                        .ToList();

                    var exp = ExpectedYomHachodesh(baseAbs, day);

                    if (exp.Single.HasValue)
                    {
                        Assert.Single(plainYh);
                        Assert.Equal(exp.Single.Value, plainYh[0]);
                        Assert.Empty(disputedYh);
                    }
                    else
                    {
                        Assert.Equal(exp.Disputed, disputedYh);
                        Assert.Empty(plainYh);
                    }

                    // Beinonit 30 and 31
                    Assert.True(result.Prishot.TryGetValue(baseAbs + 29, out var p30) && p30.Any(p => p.Code == "עו\"ב"));
                    Assert.True(result.Prishot.TryGetValue(baseAbs + 30, out var p31) && p31.Any(p => p.Code == "עו\"ל"));

                    // No prishah computed in the past
                    foreach (var abs in result.Prishot.Keys)
                    {
                        Assert.True(abs > baseAbs, $"Prishah computed in past for ({day},{month},{year}): abs {abs} <= {baseAbs}");
                    }

                    swept++;
                }
            }
        }

        Assert.True(swept >= 500, $"Expected at least 500 swept dates, got {swept}");
    }
}
