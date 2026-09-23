using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class MixedOnaEngineTests
{
    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    [Fact]
    public void MonthKind_ThreeSameDayDayOna_ThenFourthOppositeOna_MirrorsIntoOppositeOnaOnTheProjectedDay()
    {
        int abs1 = new HDate(5, 1, 5786).Abs();
        int abs2 = new HDate(5, 2, 5786).Abs();
        int abs3 = new HDate(5, 3, 5786).Abs();
        int abs4 = new HDate(5, 4, 5786).Abs();

        var db = Db();
        db[abs1] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs2] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs3] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs4] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new Taharah.Core.Models.EngineOptions { Today = abs4 });

        // The 4th sighting (night) completes a "month" mixed-onot pattern with the previous
        // three (day) sightings on the same Hebrew day-of-month - the projected day-5-of-next-
        // month entry should carry a DAY-ona concern too (the mirror), not just the ordinary
        // night-ona yom-hachodesh concern.
        var yomHachodesh = VesetEngine.GetYomHachodeshInfo(new HDate(abs4));
        Assert.True(yomHachodesh.Entries.Count > 0);
        int projectedAbs = yomHachodesh.Entries[0].Abs;

        Assert.True(result.Prishot.ContainsKey(projectedAbs), "the projected day-of-month cell exists in Prishot");
        var entries = result.Prishot[projectedAbs];

        Assert.Contains(entries, p => p.Ona == OnaType.Night && p.Code != "עו\"מ"); // the ordinary yom-hachodesh concern
        Assert.Contains(entries, p => p.Ona == OnaType.Day && p.Code == "עו\"מ" && p.Reason.Contains("עונות מעורבות"));
    }

    [Fact]
    public void HaflagahKind_FourEqualSpansSameOna_ThenFifthOppositeOna_MirrorsIntoOppositeOnaOnTheProjectedHaflagah()
    {
        int abs0 = new HDate(1, 1, 5786).Abs();
        int abs1 = abs0 + 25;
        int abs2 = abs0 + 50;
        int abs3 = abs0 + 75;
        int abs4 = abs0 + 100; // 5th sighting - same 25-day span, opposite ona

        var db = Db();
        db[abs0] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs1] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs2] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs3] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs4] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false, new Taharah.Core.Models.EngineOptions { Today = abs4 });

        int projectedAbs = abs4 + 25; // next haflagah of the same 25-day span

        Assert.True(result.Prishot.ContainsKey(projectedAbs), "the projected next-haflagah cell exists in Prishot");
        var entries = result.Prishot[projectedAbs];

        Assert.Contains(entries, p => p.Ona == OnaType.Night && p.Code == "עו\"ה"); // the ordinary haflagah concern
        Assert.Contains(entries, p => p.Ona == OnaType.Day && p.Code == "עו\"מ" && p.Reason.Contains("עונות מעורבות"));
    }
}
