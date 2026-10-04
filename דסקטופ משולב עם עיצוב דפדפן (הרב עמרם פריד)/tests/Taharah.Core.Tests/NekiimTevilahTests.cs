using Taharah.Core.Algorithms;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class NekiimTevilahTests
{
    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    [Fact]
    public void Hefsek_NoManualTevilah_CountsSevenCleanDaysAndDefaultsTevilah()
    {
        var db = Db();
        db[10000] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        Assert.Equal(7, result.Nekiim.Count);
        for (int i = 1; i <= 7; i++)
        {
            Assert.Contains(10000 + i, result.Nekiim);
        }

        // No manual tevilah recorded - defaults to the night after the 7th clean day.
        Assert.Single(result.Tevilot);
        Assert.Equal(10008, result.Tevilot[0]);
    }

    [Fact]
    public void Hefsek_InterruptedByReiyahWithinSevenDays_IsInvalidatedEntirely()
    {
        var db = Db();
        db[10000] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        db[10003] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        Assert.Empty(result.Nekiim);
        Assert.Empty(result.Tevilot);
    }

    [Fact]
    public void Hefsek_InterruptedByAnotherHefsekWithinSevenDays_IsInvalidatedEntirely()
    {
        var db = Db();
        db[10000] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        db[10005] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        // The first hefsek (10000) is cancelled by the second one landing inside its 7 clean
        // days; the second hefsek (10005) itself is not interrupted by anything after it.
        Assert.DoesNotContain(10001, result.Nekiim);
        for (int i = 1; i <= 7; i++)
        {
            Assert.Contains(10005 + i, result.Nekiim);
        }
        Assert.Single(result.Tevilot);
        Assert.Equal(10013, result.Tevilot[0]);
    }

    [Fact]
    public void Hefsek_ManualTevilahAfterExpectedDay_UsesTheRecordedDay()
    {
        var db = Db();
        db[10000] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        // Recorded on the 9th day after the hefsek (expected tevilah would default to day 8).
        db[10009] = new VesetEngine.CalendarDayEntry { Type = "tevilah", Ona = OnaType.Night };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        Assert.Single(result.Tevilot);
        Assert.Equal(10009, result.Tevilot[0]);
    }

    [Fact]
    public void Hefsek_ManualTevilahOnOrBeforeExpectedDay_FallsBackToDefault()
    {
        var db = Db();
        db[10000] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        // Recorded on day 5 - before the 7th clean day completes - does not count as the
        // real tevilah; treated like the old custom of marking the 7th day itself.
        db[10005] = new VesetEngine.CalendarDayEntry { Type = "tevilah", Ona = OnaType.Night };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        Assert.Single(result.Tevilot);
        Assert.Equal(10008, result.Tevilot[0]);
    }

    [Fact]
    public void OrZarua_ExemptedOnLeilTevilah_DoesNotAddTheShiftedEntry()
    {
        var db = Db();
        // Hefsek at 20021 with no interruption -> nekiim 20022..20028, tevilah defaults to 20029.
        db[20021] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        // A daytime reiyah whose ona-beinonit (day 30) Or Zarua shift lands on the night of
        // 20029 - exactly the leil tevilah computed above.
        db[20000] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: true);

        Assert.Contains(20029, result.Tevilot);

        // The ordinary ona-beinonit concern (day, abs 20029) still stands...
        Assert.True(result.Prishot.ContainsKey(20029));
        Assert.Contains(result.Prishot[20029], p => p.Code == "עו\"ב" && p.Ona == OnaType.Day);
        // ...but the Or Zarua shift into the night of 20029 was exempted, not added.
        Assert.DoesNotContain(result.Prishot[20029], p => p.Code == "עוא\"ז");

        Assert.Contains(result.OrZaruaExemptions, e => e.Abs == 20029 && e.Ona == OnaType.Night && e.Code == "lilTvila");
    }
}
