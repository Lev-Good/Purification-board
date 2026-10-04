using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class ReiyaExtensionEngineTests
{
    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    [Fact]
    public void MultiDayBleeding_ExtendsConcernIntoTheAdjacentOnaAtTheSameConcernTime()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        // Bled for 2 days total, starting day-ona, not closed by the time recorded - this is
        // the common case: one extra day, worrying about the single adjacent ona too.
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, DurationDays = 2, ClosedFountain = false };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs });

        // The extension applies at the SAME concern time (beinonitAbs), not a different day -
        // "she must also worry about the ADJACENT ONA", matching js/calculations.js exactly
        // (extensionOnot's abs is discarded there too; only .ona is used).
        int beinonitAbs = abs + 29;
        var entries = result.Prishot[beinonitAbs];

        Assert.Contains(entries, p => p.Ona == OnaType.Day && p.Code == "עו\"ב" && !p.Reason.Contains("משיכת הראייה"));
        Assert.Contains(entries, p => p.Ona == OnaType.Night && p.Code == "עו\"ב" && p.Reason.Contains("משיכת הראייה"));
    }

    [Fact]
    public void SingleDayBleeding_DoesNotExtendAnything()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, DurationDays = 1, ClosedFountain = true };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs });

        int beinonitAbs = abs + 29;
        var entries = result.Prishot[beinonitAbs];
        Assert.DoesNotContain(entries, p => p.Reason.Contains("משיכת הראייה"));
    }

    [Fact]
    public void BleedingFourOrMoreExtraDays_OnlyWorriesAboutTheStartingOna()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        // 5 days total = 4 extra days -> too long, no extension at all (only the start onah).
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, DurationDays = 5, ClosedFountain = false };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new EngineOptions { Today = abs });

        int beinonitAbs = abs + 29;
        var entries = result.Prishot[beinonitAbs];
        Assert.Contains(entries, p => p.Ona == OnaType.Day && p.Code == "עו\"ב");
        Assert.DoesNotContain(entries, p => p.Reason.Contains("משיכת הראייה"));
    }
}

