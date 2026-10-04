using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class FrightTests
{
    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    [Fact]
    public void FrightDay_Unresolved_IsOpen_NotWipeOnly()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Marks = [] };
        db[abs + 1] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day, Marks = ["fright"] };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });

        Assert.Contains(abs + 1, result.Fright.Days);
        var item = Assert.Single(result.Fright.Open);
        Assert.Equal(abs + 1, item.Abs);
        Assert.False(item.Resolved);
        Assert.False(item.Sighting);
        Assert.False(item.ProperCheck);
        Assert.False(item.WipeOnly);
        Assert.Empty(result.Fright.Settled);
    }

    [Fact]
    public void FrightDay_WipeOnlyCheck_StaysOpen_ButFlaggedWipeOnly()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "wipe", Marks = ["fright"] };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });

        var item = Assert.Single(result.Fright.Open);
        Assert.False(item.Resolved);
        Assert.False(item.ProperCheck);
        Assert.True(item.WipeOnly);
    }

    [Fact]
    public void FrightDay_ProperDeepCheck_IsSettled()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "deep", Marks = ["fright"] };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });

        Assert.Empty(result.Fright.Open);
        var item = Assert.Single(result.Fright.Settled);
        Assert.True(item.Resolved);
        Assert.True(item.ProperCheck);
        Assert.False(item.WipeOnly);
    }

    [Fact]
    public void FrightDay_ResolvedBySighting_IsSettled()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Marks = ["fright"] };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });

        Assert.Empty(result.Fright.Open);
        var item = Assert.Single(result.Fright.Settled);
        Assert.True(item.Resolved);
        Assert.True(item.Sighting);
    }

    [Fact]
    public void DemandsBedikah_OnlyTrueWhenStringencyOnAndDayIsUnresolved()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day, Marks = ["fright"] };

        var withoutStringency = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });
        Assert.False(withoutStringency.Fright.DemandsBedikah);
        Assert.False(withoutStringency.Fright.Open[0].DemandsBedikah);

        var withStringency = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions
        {
            Today = abs + 5,
            Stringencies = new Dictionary<string, bool> { ["frightBedika"] = true }
        });
        Assert.True(withStringency.Fright.DemandsBedikah);
        Assert.True(withStringency.Fright.Open[0].DemandsBedikah);
        // And the pending-check demand itself only appears when the stringency is on.
        Assert.Contains(withStringency.PendingChecks, p => p.Kind == "fright" && p.Abs == abs);
        Assert.DoesNotContain(withoutStringency.PendingChecks, p => p.Kind == "fright");
    }

    [Fact]
    public void AnxietyDays_AreTrackedSeparatelyFromFright()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day, Marks = ["anxiety"] };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs + 5 });

        Assert.Contains(abs, result.Fright.AnxietyDays);
        Assert.Empty(result.Fright.Days);
    }
}

