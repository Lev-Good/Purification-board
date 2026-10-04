using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class EngineTests
{
    [Fact]
    public void Scenario1_SingleReiyah_Daytime_NoOrZarua()
    {
        // Scenario: single reiyah on absolute day 10000, daytime onah, Or Zarua disabled.
        var db = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [10000] = ("reiyah", OnaType.Day, null)
        };

        var result = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);

        Assert.Single(result.Reiyot);
        Assert.True(result.Prishot.ContainsKey(10029), "day 30 (abs 10029) exists in prishot");
        Assert.True(result.Prishot.ContainsKey(10030), "day 31 (abs 10030) exists in prishot");

        var day30 = result.Prishot[10029];
        var day31 = result.Prishot[10030];

        Assert.Contains(day30, p => p.Code == "עו\"ב" && p.Ona == OnaType.Day);
        Assert.Contains(day31, p => p.Code == "עו\"ל" && p.Ona == OnaType.Day);
    }

    [Fact]
    public void Scenario2_SameReiyah_NightOnah_WithOrZarua()
    {
        // Scenario 2: same reiyah but night onah - day 31 should shift back one day for Or Zarua.
        var db2 = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [10000] = ("reiyah", OnaType.Night, null)
        };

        var c2 = VesetEngine.CalculateEngine(db2, isOrZaruaEnabled: true);

        Assert.Contains(c2.Prishot[10029], p => p.Code == "עו\"ב" && p.Ona == OnaType.Night);
        Assert.Contains(c2.Prishot[10029], p => p.Code == "עוא\"ז");
        Assert.Contains(c2.Prishot[10028], p => p.Code == "עוא\"ז");
    }

    [Fact]
    public void Scenario3_TwoReiyot_ProducesHaflagah()
    {
        // Scenario 3: two reiyot also produce haflagah entries without crashing.
        var db3 = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [10000] = ("reiyah", OnaType.Day, null),
            [10035] = ("reiyah", OnaType.Night, null)
        };

        var c3 = VesetEngine.CalculateEngine(db3, isOrZaruaEnabled: false);

        Assert.True(c3.Prishot.ContainsKey(10070));
        Assert.Contains(c3.Prishot[10070], p => p.Code == "עו\"ה");
        Assert.Contains(c3.Prishot[10065], p => p.Code == "עו\"ל");
    }

    [Fact]
    public void ShiftHebrewMonth_CrossRoshHashanah()
    {
        // Elul (6) -> Tishrei (7) crosses the year number
        var nextElul = VesetEngine.ShiftHebrewMonth(5786, 6, 1);
        Assert.Equal(5787, nextElul.Year);
        Assert.Equal(7, nextElul.Month);

        // Tishrei (7) -> Elul (6) crosses back
        var prevTishrei = VesetEngine.ShiftHebrewMonth(5786, 7, -1);
        Assert.Equal(5785, prevTishrei.Year);
        Assert.Equal(6, prevTishrei.Month);

        // Adar (12, non-leap year 5786) -> Nisan 5786, SAME year number
        var nextAdar = VesetEngine.ShiftHebrewMonth(5786, 12, 1);
        Assert.Equal(5786, nextAdar.Year);
        Assert.Equal(1, nextAdar.Month);
    }

    [Fact]
    public void YomHachodesh_CrossRoshHashanah()
    {
        // Reiyah on 1 Elul 5786 -> yom hachodesh = 1 Tishrei 5787 (not 1 Tishrei 5786)
        var elulAbs = new HDate(1, 6, 5786).Abs();
        var db = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [elulAbs] = ("reiyah", OnaType.Day, null)
        };

        var cRosh = VesetEngine.CalculateEngine(db, isOrZaruaEnabled: false);
        var tishreiNextAbs = new HDate(1, 7, 5787).Abs();

        Assert.True(cRosh.Prishot.ContainsKey(tishreiNextAbs));
        Assert.Contains(cRosh.Prishot[tishreiNextAbs], p => p.Code == "יו\"ח");
    }
}
