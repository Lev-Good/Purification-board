using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class OnotMeuravotTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Reiyah(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs) };

    [Fact]
    public void ThreeDayOneNight_DetectedAsMixedOna()
    {
        // שלש ביום והרביעית בלילה
        var threeDay = new[] { D(15, 1, 5786), D(15, 2, 5786), D(15, 3, 5786) };
        int fourthNight = D(15, 4, 5786);

        var list = threeDay.Select(a => Reiyah(a, OnaType.Day)).ToList();
        list.Add(Reiyah(fourthNight, OnaType.Night));

        var chazaka = ChazakaManager.AnalyzeChazaka(list);

        Assert.NotNull(chazaka.MixedOna);
        Assert.Single(chazaka.MixedOna);
        Assert.Equal("month", chazaka.MixedOna[0].Kind);
        Assert.Equal(15, chazaka.MixedOna[0].DayOfMonth);
        Assert.Equal(OnaType.Day, chazaka.MixedOna[0].FirstOna);
        Assert.Equal(OnaType.Night, chazaka.MixedOna[0].LastOna);
        Assert.Empty(chazaka.Established); // Not established as a regular fixed veset
    }

    [Fact]
    public void FourInSameOna_NotMixedOna()
    {
        var threeDay = new[] { D(15, 1, 5786), D(15, 2, 5786), D(15, 3, 5786), D(15, 4, 5786) };
        var list = threeDay.Select(a => Reiyah(a, OnaType.Day)).ToList();

        var chazaka = ChazakaManager.AnalyzeChazaka(list);
        Assert.Null(chazaka.MixedOna);
        Assert.Single(chazaka.Established);
    }
}
