using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetDilugTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Sighting(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs) };

    [Fact]
    public void DetectDilug_TwoDayCycle_Detected()
    {
        // מחזור של ב' ימים החוזר פעמיים: ט"ו–ט"ז בתשרי–כסלו, ושוב בטבת–שבט
        var cycle2 = new List<ReiyahEvent>
        {
            Sighting(D(15, HDate.Tishrei, 5785)),
            Sighting(D(16, HDate.Cheshvan, 5785)),
            Sighting(D(15, HDate.Kislev, 5785)),
            Sighting(D(16, HDate.Tevet, 5785))
        };

        var found = VesetDilugManager.DetectDilugCandidates(cycle2);

        Assert.Single(found);
        Assert.Equal("15,16", string.Join(",", found[0].Cycle));
        Assert.Equal(0, found[0].NextIndex);
        Assert.Equal(OnaType.Day, found[0].Ona);
    }

    [Fact]
    public void DetectDilug_ThreeDayCycle_Detected()
    {
        // מחזור של ג' ימים: ט"ו–ט"ז–י"ז פעמיים רצוף
        var cycle3 = new List<ReiyahEvent>
        {
            Sighting(D(15, HDate.Tishrei, 5785)),
            Sighting(D(16, HDate.Cheshvan, 5785)),
            Sighting(D(17, HDate.Kislev, 5785)),
            Sighting(D(15, HDate.Tevet, 5785)),
            Sighting(D(16, HDate.Shvat, 5785)),
            Sighting(D(17, HDate.AdarI, 5785))
        };

        var found = VesetDilugManager.DetectDilugCandidates(cycle3);

        Assert.Single(found);
        Assert.Equal("15,16,17", string.Join(",", found[0].Cycle));
    }

    [Fact]
    public void DetectDilug_BrokenCycle_NotDetected()
    {
        // מחזור מקוטע — אינו מזוהה
        var broken = new List<ReiyahEvent>
        {
            Sighting(D(15, HDate.Tishrei, 5785)),
            Sighting(D(16, HDate.Cheshvan, 5785)),
            Sighting(D(15, HDate.Kislev, 5785)),
            Sighting(D(18, HDate.Tevet, 5785))
        };

        var found = VesetDilugManager.DetectDilugCandidates(broken);
        Assert.Empty(found);
    }
}
