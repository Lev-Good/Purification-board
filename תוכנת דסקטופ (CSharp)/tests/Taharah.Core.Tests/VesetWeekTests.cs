using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetWeekTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Reiyah(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs) };

    [Fact]
    public void Establish_WeekVeset_ThreeSightingsOneWeekApartSameOna()
    {
        // ג' ראיות באותו יום בשבוע, כל שבעה ימים, ובאותה עונה
        int @base = D(5, 1, 5786);
        var weekly = new List<ReiyahEvent>
        {
            Reiyah(@base, OnaType.Day),
            Reiyah(@base + 7, OnaType.Day),
            Reiyah(@base + 14, OnaType.Day)
        };

        var chazaka = ChazakaManager.AnalyzeChazaka(weekly);
        var weekVeset = chazaka.Established.FirstOrDefault(v => v.Kind == "week");

        Assert.NotNull(weekVeset);
        Assert.Equal(new HDate(@base + 14).DayOfWeek, weekVeset.Weekday);
        Assert.Equal(3, weekVeset.EstablishedBy.Count);
    }

    [Fact]
    public void SpacedSightings_NotWeekApart_DoesNotEstablish()
    {
        // אותו יום בשבוע — אך ההפלגות אינן שבוע: אין וסת שבוע
        int @base = D(5, 1, 5786);
        var spaced = new List<ReiyahEvent>
        {
            Reiyah(@base, OnaType.Day),
            Reiyah(@base + 14, OnaType.Day),
            Reiyah(@base + 28, OnaType.Day)
        };

        var chazaka = ChazakaManager.AnalyzeChazaka(spaced);
        Assert.DoesNotContain(chazaka.Established, v => v.Kind == "week");
    }
}
