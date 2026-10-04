using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetMevuchaTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Reiyah(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs) };

    [Fact]
    public void DetectAlternatingDays_Established()
    {
        // כ"ז וכ"ט בכל אחד מג' חודשים — ובחודש כ"ח לא ראתה
        var alternating = new List<ReiyahEvent>();
        foreach (var month in new[] { 1, 2, 3 })
        {
            alternating.Add(Reiyah(D(27, month, 5786)));
            alternating.Add(Reiyah(D(29, month, 5786)));
        }

        var found = ChazakaManager.FindAlternatingDays(alternating);
        Assert.NotNull(found);
        Assert.Equal([27, 29], found.Days);
        Assert.Equal(6, found.EstablishedBy.Count);

        var chazaka = ChazakaManager.AnalyzeChazaka(alternating);
        Assert.Contains(chazaka.Established, v => v.Kind == "mevucha");
        Assert.DoesNotContain(chazaka.Established, v => v.Kind == "haflagah");
    }

    [Fact]
    public void MiddleDaySeen_BreaksDetection()
    {
        // ראתה גם ביום המפסיק — "וביום כ"ח לא ראתה" אינו מתקיים
        var alternating = new List<ReiyahEvent>();
        foreach (var month in new[] { 1, 2, 3 })
        {
            alternating.Add(Reiyah(D(27, month, 5786)));
            alternating.Add(Reiyah(D(29, month, 5786)));
        }

        alternating.AddRange([
            Reiyah(D(28, 1, 5786)),
            Reiyah(D(28, 2, 5786)),
            Reiyah(D(28, 3, 5786))
        ]);

        var found = ChazakaManager.FindAlternatingDays(alternating);
        Assert.Null(found);
    }
}
