using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetSirugTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Sighting(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs) };

    [Fact]
    public void BookExample_NisanSivanAv_EstablishesSirug()
    {
        // עמ' 96 סעיף כח-כט: ראתה בא' בניסן, א' בסיון, א' באב (כולם עונת יום) -
        // קבעה וסת הסירוג לא' בחודש, פעם בחודשיים.
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785)),
            Sighting(D(1, HDate.Sivan, 5785)),
            Sighting(D(1, HDate.Av, 5785))
        };

        var found = VesetSirugManager.DetectSirugCandidates(reiyot);

        var sirug = Assert.Single(found);
        Assert.Equal(1, sirug.Day);
        Assert.Equal(OnaType.Day, sirug.Ona);
        Assert.Equal(2, sirug.MonthInterval);
        Assert.Equal(3, sirug.EstablishedBy.Count);
    }

    [Fact]
    public void ConsecutiveMonths_NotSirug()
    {
        // חודשים רצופים (ללא דילוג) - זה וסת החודש הרגיל, לא סירוג.
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785)),
            Sighting(D(1, HDate.Iyyar, 5785)),
            Sighting(D(1, HDate.Sivan, 5785))
        };

        var found = VesetSirugManager.DetectSirugCandidates(reiyot);
        Assert.Empty(found);
    }

    [Fact]
    public void DifferentOna_BreaksTheRun()
    {
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785), OnaType.Day),
            Sighting(D(1, HDate.Sivan, 5785), OnaType.Night),
            Sighting(D(1, HDate.Av, 5785), OnaType.Day)
        };

        var found = VesetSirugManager.DetectSirugCandidates(reiyot);
        Assert.Empty(found);
    }

    [Fact]
    public void OnlyTwoOccurrences_NotYetEstablished()
    {
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785)),
            Sighting(D(1, HDate.Sivan, 5785))
        };

        var found = VesetSirugManager.DetectSirugCandidates(reiyot);
        Assert.Empty(found); // fewer than SirugSightingsNeeded (3) - not yet disclosed as a candidate
    }

    [Fact]
    public void ProjectFixedVeset_AnchorsToOwnEstablishedBy_NotUnrelatedLaterReiyah()
    {
        // Regression test (found in code review): VesetEngine.ProjectFixedVeset's sirug branch
        // used to derive its starting month from the caller's shared "last counted reiyah across
        // the whole history" (lastCounted) rather than this veset's own last establishing
        // sighting. If a later, unrelated reiyah existed in a different month, every future
        // projected sirug date would land a full interval off-phase - and could even skip the
        // true next occurrence entirely, as this test demonstrates.
        int avSighting = D(1, HDate.Av, 5785);
        var veset = new EstablishedVeset
        {
            Kind = "sirug",
            Ona = OnaType.Day,
            DayOfMonth = 1,
            MonthInterval = 2,
            Label = "test",
            EstablishedBy = [D(1, HDate.Nisan, 5785), D(1, HDate.Sivan, 5785), avSighting]
        };

        // An unrelated later reiyah on a different day, in a later month - simulates the
        // shared "lastCounted" anchor drifting away from the sirug's own last occurrence.
        var unrelatedLater = Sighting(D(20, HDate.Elul, 5785));

        var entries = VesetEngine.ProjectFixedVeset(veset, unrelatedLater, horizonDays: 200);

        // Av (5) + 2 months = Tishrei (7) - but Elul->Tishrei is where the Year field itself
        // rolls over in this codebase's HDate convention (months are Nisan-numbered 1-12/13,
        // but the Year increments at Tishrei), so the correct next occurrence is Tishrei of
        // the FOLLOWING year number (5786), not "Tishrei 5785" (which is chronologically
        // months earlier than Av 5785, not later - Tishrei opens the year, Elul closes it).
        int expectedNext = D(1, HDate.Tishrei, 5786);
        Assert.Contains(entries, e => e.Abs == expectedNext);
    }

    [Fact]
    public void BookExample_EstablishesSirugOnly_NotAConflictingRegularMonthVeset()
    {
        // Regression test for a real bug found in code review (2026-09-23) and fixed:
        // ChazakaManager's "month veset" track used to only check that consecutive COUNTED
        // entries share day-of-month + ona - it never required them to fall in consecutive
        // Hebrew months. The book's own sirug example (א' ניסן, א' סיון, א' אב) used to also
        // satisfy that check, co-establishing a contradictory regular month veset (implying
        // every month) alongside the correct sirug veset (every other month). Fixed by adding
        // a month-adjacency requirement to the month track.
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785)),
            Sighting(D(1, HDate.Sivan, 5785)),
            Sighting(D(1, HDate.Av, 5785))
        };

        var result = ChazakaManager.AnalyzeChazaka(reiyot);

        Assert.DoesNotContain(result.Established, v => v.Kind == "month");
        Assert.Contains(result.Established, v => v.Kind == "sirug");
    }

    [Fact]
    public void ConsecutiveMonths_StillEstablishRegularMonthVeset()
    {
        // Guards the month-adjacency fix from over-correcting: a genuinely consecutive-month
        // same-day/ona run must still establish a plain "month" veset, exactly as before.
        var reiyot = new List<ReiyahEvent>
        {
            Sighting(D(1, HDate.Nisan, 5785)),
            Sighting(D(1, HDate.Iyyar, 5785)),
            Sighting(D(1, HDate.Sivan, 5785))
        };

        var result = ChazakaManager.AnalyzeChazaka(reiyot);

        Assert.Contains(result.Established, v => v.Kind == "month");
    }
}
