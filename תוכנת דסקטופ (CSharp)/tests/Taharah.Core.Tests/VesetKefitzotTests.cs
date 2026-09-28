using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetKefitzotTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();
    private static ReiyahEvent Jump(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Kind = VesetKefitzotManager.KefitzaKind };
    private static ReiyahEvent Regular(int abs, OnaType ona = OnaType.Day) =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Kind = "regular" };

    [Fact]
    public void MonthTrack_OneJump_DisclosedButNotEstablished()
    {
        // עמ' 92 סעיף ח: קפצה בליל א' בשבט וראתה - חוששת לחודש הבא אם תקפוץ שוב, אך לא קבועה עדיין.
        var reiyot = new List<ReiyahEvent> { Jump(D(1, HDate.Shvat, 5785), OnaType.Night) };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        var month = found.Single(c => c.Kind == "month");

        Assert.Equal(1, month.DayOfMonth);
        Assert.Equal(OnaType.Night, month.Ona);
        Assert.False(month.Established);
    }

    [Fact]
    public void MonthTrack_ThreeJumpsSameDateAndOna_Established()
    {
        // עמ' 93 סעיף טו: שלש פעמים קפצה וראתה באותו תאריך ובאותה עונה - קבועה.
        var reiyot = new List<ReiyahEvent>
        {
            Jump(D(1, HDate.Shvat, 5785)),
            Jump(D(1, HDate.AdarI, 5785)),
            Jump(D(1, HDate.Nisan, 5785))
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        var month = found.Single(c => c.Kind == "month");

        Assert.True(month.Established);
        Assert.Equal(3, month.EstablishedBy.Count);
    }

    [Fact]
    public void MonthTrack_DifferentDate_DoesNotAccumulate()
    {
        // עמ' 92 סעיף ט: קפצה בתאריך אחר - אינה חוששת מצד וסת החודש לתאריך הקודם.
        var reiyot = new List<ReiyahEvent>
        {
            Jump(D(1, HDate.Shvat, 5785)),
            Jump(D(5, HDate.AdarI, 5785))
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        var month = found.Single(c => c.Kind == "month");

        Assert.Equal(5, month.DayOfMonth); // only the trailing run counts, the mismatched earlier jump breaks the run
        Assert.False(month.Established);
        Assert.Single(month.EstablishedBy);
    }

    [Fact]
    public void HaflagahTrack_FourJumpsEqualSpans_Established()
    {
        // עמ' 93 סעיף טז: ד' קפיצות בג' הפלגות שוות ובאותה עונה - קבועה להפלגה.
        var reiyot = new List<ReiyahEvent>
        {
            Jump(1000),
            Jump(1020),
            Jump(1040),
            Jump(1060)
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        var haflagah = found.Single(c => c.Kind == "haflagah");

        Assert.True(haflagah.Established);
        Assert.Equal(20, haflagah.Span);
        Assert.Equal(4, haflagah.EstablishedBy.Count);
    }

    [Fact]
    public void AnyTrack_ThreeJumpsRegardlessOfPattern_AlwaysWorried()
    {
        // עמ' 93 סעיף יז: שלש קפיצות שהובילו לראייה בלי קשר לתאריך/הפלגה - חוששת לעצם הקפיצה.
        var reiyot = new List<ReiyahEvent>
        {
            Jump(1000),
            Jump(1050),
            Jump(1090)
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        var any = found.Single(c => c.Kind == "any");

        Assert.True(any.Established);
        Assert.Equal(3, any.EstablishedBy.Count);
    }

    [Fact]
    public void NonJumpSightings_AreIgnoredEntirely()
    {
        var reiyot = new List<ReiyahEvent>
        {
            Regular(D(1, HDate.Shvat, 5785)),
            Regular(D(1, HDate.AdarI, 5785)),
            Regular(D(1, HDate.Nisan, 5785))
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(reiyot);
        Assert.Empty(found);
    }

    [Fact]
    public void HaflagahTrack_MixedOnaOldestJump_ExcludedNotEstablished()
    {
        // Regression test for a real bug found in code review (2026-09-23) and fixed: the
        // haflagah-track ona-consistency loop used to check jumps[i].Ona (the newer member of
        // each pair), never jumps[i-1].Ona (the older, newly-included one) - and separately
        // started `spans` at a hard-coded 1 without ever checking jumps[^2]'s ona at all.
        // Together these let a wrong-ona oldest jump be silently folded into an "Established"
        // haflagah pattern whenever the numeric interval happened to line up. Fixed by checking
        // every newly-included sighting's ona explicitly.
        var jumps = new List<ReiyahEvent>
        {
            Jump(1000, OnaType.Night), // wrong ona for this pattern - must now break the run
            Jump(1020, OnaType.Day),
            Jump(1040, OnaType.Day),
            Jump(1060, OnaType.Day)
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(jumps);
        var haflagah = found.Single(c => c.Kind == "haflagah");

        Assert.False(haflagah.Established);
        Assert.DoesNotContain(1000, haflagah.EstablishedBy);
    }

    [Fact]
    public void HaflagahTrack_AllSameOna_StillEstablishes()
    {
        // Guards the ona-check fix from over-correcting: a genuinely same-ona, equal-interval
        // run of 4 jumps must still establish, exactly as before.
        var jumps = new List<ReiyahEvent>
        {
            Jump(1000, OnaType.Day),
            Jump(1020, OnaType.Day),
            Jump(1040, OnaType.Day),
            Jump(1060, OnaType.Day)
        };

        var found = VesetKefitzotManager.AnalyzeKefitzot(jumps);
        var haflagah = found.Single(c => c.Kind == "haflagah");

        Assert.True(haflagah.Established);
        Assert.Equal(4, haflagah.EstablishedBy.Count);
    }

    [Fact]
    public void AnalyzeChazaka_ExposesKefitzotCandidates_RegardlessOfMainChazaka()
    {
        var reiyot = new List<ReiyahEvent>
        {
            Jump(D(1, HDate.Shvat, 5785)),
            Jump(D(1, HDate.AdarI, 5785)),
            Jump(D(1, HDate.Nisan, 5785))
        };

        var result = ChazakaManager.AnalyzeChazaka(reiyot);
        Assert.Contains(result.KefitzotCandidates, c => c.Kind == "month" && c.Established);
        // Kefitzot-kind sightings are not excluded from the main chazaka count (they count for onah beinonit, סעיף י).
        Assert.Equal(3, result.Counted.Count);
    }
}
