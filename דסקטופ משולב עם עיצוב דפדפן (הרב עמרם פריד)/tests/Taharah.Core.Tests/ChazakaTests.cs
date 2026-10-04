using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class ChazakaTests
{
    private static ReiyahEvent MakeReiyah(int abs, OnaType ona = OnaType.Day, string kind = "regular", int? durationDays = null, bool? closedFountain = null)
    {
        return new ReiyahEvent
        {
            Abs = abs,
            Ona = ona,
            HDate = new HDate(abs),
            Kind = kind,
            DurationDays = durationDays,
            ClosedFountain = closedFountain
        };
    }

    [Fact]
    public void Exclude_Ones_FromChazakaCount()
    {
        // ראייה מחמת אונס או קפיצה אינה מן המניין.
        var reiyot = new List<ReiyahEvent>
        {
            MakeReiyah(10000),
            MakeReiyah(10030, OnaType.Day, kind: "ones"),
            MakeReiyah(10060)
        };

        var (counted, excluded) = ChazakaManager.ClassifyReiyot(reiyot);

        Assert.Equal(2, counted.Count);
        Assert.Single(excluded);
        Assert.Equal("ones", excluded[0].Reason);
        Assert.Equal(10030, excluded[0].Abs);
    }

    [Fact]
    public void Exclude_Continuation_MergedWithPrevious()
    {
        // המשך דימום — נמנה עם הראייה שקדמה לו.
        var reiyot = new List<ReiyahEvent>
        {
            MakeReiyah(10000),
            MakeReiyah(10003, OnaType.Day, closedFountain: false, durationDays: 4)
        };

        var (counted, excluded) = ChazakaManager.ClassifyReiyot(reiyot);

        Assert.Single(counted);
        Assert.Single(excluded);
        Assert.Equal("continuation", excluded[0].Reason);
        Assert.Equal(10000, excluded[0].MergedInto);
    }

    [Fact]
    public void Establish_MonthVeset_ThreeSightingsSameDaySameOna()
    {
        // ג' ראיות באותו יום בחודש ובאותה עונה.
        var reiyot = new List<ReiyahEvent>
        {
            MakeReiyah(new HDate(5, 8, 5787).Abs(), OnaType.Day),
            MakeReiyah(new HDate(5, 9, 5787).Abs(), OnaType.Day),
            MakeReiyah(new HDate(5, 10, 5787).Abs(), OnaType.Day)
        };

        var chazaka = ChazakaManager.AnalyzeChazaka(reiyot);

        Assert.Single(chazaka.Established);
        Assert.Equal("month", chazaka.Established[0].Kind);
        Assert.Equal(5, chazaka.Established[0].DayOfMonth);
        Assert.Equal(OnaType.Day, chazaka.Established[0].Ona);
    }

    [Fact]
    public void MixedOnot_DoesNotEstablish_MonthVeset()
    {
        // עונות מעורבות — לא נקבע.
        var reiyot = new List<ReiyahEvent>
        {
            MakeReiyah(new HDate(5, 8, 5787).Abs(), OnaType.Day),
            MakeReiyah(new HDate(5, 9, 5787).Abs(), OnaType.Night),
            MakeReiyah(new HDate(5, 10, 5787).Abs(), OnaType.Day)
        };

        var chazaka = ChazakaManager.AnalyzeChazaka(reiyot);
        Assert.Empty(chazaka.Established);
    }
}
