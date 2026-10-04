using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class PillPauseTests
{
    private static LifeStateVerdict Verdict(LifeStateModel life, List<ReiyahEvent>? reiyot, int? today) =>
        LifeStateManager.AnalyzeLifeState(life, reiyot ?? [], today);

    private static ReiyahEvent Reiya(int abs, OnaType ona) => new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Counted = true };

    [Fact]
    public void PillPause_DaysTwoToFiveHaveConcerns_DayOnePermitted()
    {
        int @base = 10000;
        int pauseAbs = @base + 29;
        var life = new LifeStateModel
        {
            Enabled = true,
            Pills = [new PillPeriod { StartAbs = @base, EndAbs = pauseAbs, Type = "combined" }]
        };

        var verdict = PillPauseManager.AnalyzePillPause(Verdict(life, null, @base + 60), [], @base + 60);

        Assert.True(verdict.Configured);
        Assert.Single(verdict.Pauses);

        Assert.DoesNotContain(verdict.Concerns, c => c.Abs == pauseAbs + 1);

        for (int day = PillPauseManager.PillPauseFirstDay; day <= PillPauseManager.PillPauseLastDay; day++)
        {
            int targetAbs = pauseAbs + day;
            Assert.Contains(verdict.Concerns, c => c.Abs == targetAbs && c.Ona == OnaType.Day);
            Assert.Contains(verdict.Concerns, c => c.Abs == targetAbs && c.Ona == OnaType.Night);
        }

        Assert.DoesNotContain(verdict.Concerns, c => c.Abs == pauseAbs + 6);
    }

    [Fact]
    public void EngineIntegration_PauseConcernsPlacedOnCalendar_DoNotSuppressOthers_NoCheckDemand()
    {
        int @base = 10000;
        var pauses = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "combined" },
            new() { StartAbs = @base + 70, EndAbs = @base + 99, Type = "combined" },
            new() { StartAbs = @base + 140, EndAbs = @base + 169, Type = "combined" }
        };
        var sightings = new List<(int Abs, OnaType Ona)>
        {
            (@base + 32, OnaType.Night), (@base + 102, OnaType.Night)
        };
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>();
        foreach (var (abs, ona) in sightings) db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = ona };

        var life = new LifeStateModel { Enabled = true, Pills = pauses };
        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = @base + 200, Life = life });

        Assert.True(result.PillPause!.Configured);
        Assert.Contains(result.Prishot.Values.SelectMany(x => x), p => p.Code == PillPauseManager.PauseCode);

        // A fixed/non-fixed pill veset does not replace the ordinary concerns.
        Assert.Contains(result.Prishot.Values.SelectMany(x => x), p => p.Code == "עו\"ב");

        // And it creates no "forbidden until checked" demand.
        Assert.DoesNotContain(result.PendingChecks, p => p.Code == PillPauseManager.PauseCode);
    }

    [Fact]
    public void EstablishedDay_FromPriorPause_NarrowsToSingleOna()
    {
        int @base = 20000;
        var pauses = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "combined" },
            new() { StartAbs = @base + 70, EndAbs = @base + 100, Type = "combined" }
        };
        var reiyot = new List<ReiyahEvent> { Reiya(@base + 32, OnaType.Night) }; // day 3 after first pause
        var life = new LifeStateModel { Enabled = true, Pills = pauses };
        var lifeVerdict = Verdict(life, reiyot, @base + 120);

        var verdict = PillPauseManager.AnalyzePillPause(lifeVerdict, reiyot, @base + 120);

        Assert.Single(verdict.Established);
        Assert.Equal(3, verdict.Established[0].OffsetDays);
        Assert.Equal(OnaType.Night, verdict.Established[0].Ona);
        Assert.False(verdict.Established[0].Fixed);

        int pause2 = @base + 100;
        var day3 = verdict.Concerns.Where(c => c.Abs == pause2 + 3).ToList();
        Assert.Single(day3);
        Assert.Equal(OnaType.Night, day3[0].Ona);
        Assert.Contains("אינו קבוע", day3[0].Reason);
    }

    [Fact]
    public void ThreeSightingsOnSameOffset_FixesPauseDay()
    {
        int @base = 30000;
        var pauses = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "combined" },
            new() { StartAbs = @base + 70, EndAbs = @base + 99, Type = "combined" },
            new() { StartAbs = @base + 140, EndAbs = @base + 169, Type = "combined" },
            new() { StartAbs = @base + 210, EndAbs = @base + 239, Type = "combined" }
        };
        var reiyot = new List<ReiyahEvent>
        {
            Reiya(@base + 32, OnaType.Night), Reiya(@base + 102, OnaType.Night), Reiya(@base + 172, OnaType.Night)
        };
        var life = new LifeStateModel { Enabled = true, Pills = pauses };
        var lifeVerdict = Verdict(life, reiyot, @base + 260);

        var verdict = PillPauseManager.AnalyzePillPause(lifeVerdict, reiyot, @base + 260);
        var fixedEntry = verdict.Established.FirstOrDefault(e => e.OffsetDays == 3);

        Assert.NotNull(fixedEntry);
        Assert.True(fixedEntry!.Fixed);
        Assert.Equal(3, fixedEntry.Count);

        var fixedConcern = verdict.Concerns.FirstOrDefault(c => c.Abs == @base + 239 + 3);
        Assert.NotNull(fixedConcern);
        Assert.Contains("נקבעה", fixedConcern!.Reason);
    }

    [Fact]
    public void NoOrZaruaShift_AddedForPauseDayConcern()
    {
        int @base = 40000;
        var pauses = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "combined" }
        };
        var life = new LifeStateModel { Enabled = true, Pills = pauses };
        var withOrZarua = VesetEngine.CalculateEngine(new Dictionary<int, VesetEngine.CalendarDayEntry>(), true, new EngineOptions { Today = @base + 60, Life = life });
        var withoutOrZarua = VesetEngine.CalculateEngine(new Dictionary<int, VesetEngine.CalendarDayEntry>(), false, new EngineOptions { Today = @base + 60, Life = life });

        int pauseAbs = @base + 29;
        bool hasOrZaruaNearPause = result_HasOrZaruaNear(withOrZarua, pauseAbs);
        Assert.False(hasOrZaruaNearPause);

        int pauseCodeCountWith = withOrZarua.Prishot.Values.SelectMany(x => x).Count(p => p.Code == PillPauseManager.PauseCode);
        int pauseCodeCountWithout = withoutOrZarua.Prishot.Values.SelectMany(x => x).Count(p => p.Code == PillPauseManager.PauseCode);
        Assert.Equal(pauseCodeCountWithout, pauseCodeCountWith);
    }

    private static bool result_HasOrZaruaNear(EngineResult result, int pauseAbs)
    {
        for (int abs = pauseAbs; abs <= pauseAbs + PillPauseManager.PillPauseLastDay; abs++)
        {
            if (result.Prishot.TryGetValue(abs, out var list) && list.Any(p => p.Code == "עוא\"ז"))
                return true;
        }
        return false;
    }

    [Fact]
    public void PillPause_InsidePregnancyDormancy_ProducesNoConcern()
    {
        int @base = 50000;
        var life = new LifeStateModel
        {
            Enabled = true,
            PregnancyAbs = @base - 10,
            Pills = [new PillPeriod { StartAbs = @base + 90, EndAbs = @base + 100, Type = "combined" }]
        };
        var lifeVerdict = Verdict(life, [], @base + 120);
        var verdict = PillPauseManager.AnalyzePillPause(lifeVerdict, [], @base + 120);

        Assert.Empty(verdict.Pauses);
    }

    [Fact]
    public void PauseDayNumber_ZeroOnPauseDay_NullBeforeIt()
    {
        int @base = 60000;
        Assert.Equal(0, PillPauseManager.PauseDayNumber(@base + 29, @base + 29));
        Assert.Equal(1, PillPauseManager.PauseDayNumber(@base + 29, @base + 30));
        Assert.Null(PillPauseManager.PauseDayNumber(@base + 29, @base + 20));
    }

    [Fact]
    public void OrgastPills_NoWindowComputed_NoConcernsOrEstablishment()
    {
        int @base = 70000;
        var orgastPills = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "orgast" },
            new() { StartAbs = @base + 70, EndAbs = @base + 99, Type = "orgast" }
        };
        var reiyot = new List<ReiyahEvent> { Reiya(@base + 32, OnaType.Night) };
        var life = new LifeStateModel { Enabled = true, Pills = orgastPills };
        var lifeVerdict = Verdict(life, reiyot, @base + 120);

        var verdict = PillPauseManager.AnalyzePillPause(lifeVerdict, reiyot, @base + 120);

        Assert.True(verdict.Configured);
        Assert.Equal(2, verdict.Pauses.Count);
        Assert.All(verdict.Pauses, p => Assert.Equal("regimen", p.Rule));
        Assert.All(verdict.Pauses, p => Assert.Null(p.LastDay));
        Assert.Empty(verdict.Concerns);
        Assert.Null(verdict.Active);
        Assert.Empty(verdict.Established);
        Assert.Equal(2, verdict.RegimenPauses.Count);
    }

    [Fact]
    public void OrdinaryPills_SameRecord_DoesProduceConcernAndEstablishment()
    {
        int @base = 80000;
        var ordinaryPills = new List<PillPeriod>
        {
            new() { StartAbs = @base, EndAbs = @base + 29, Type = "combined" },
            new() { StartAbs = @base + 70, EndAbs = @base + 99, Type = "combined" }
        };
        var reiyot = new List<ReiyahEvent> { Reiya(@base + 32, OnaType.Night) };
        var life = new LifeStateModel { Enabled = true, Pills = ordinaryPills };
        var lifeVerdict = Verdict(life, reiyot, @base + 120);

        var verdict = PillPauseManager.AnalyzePillPause(lifeVerdict, reiyot, @base + 120);

        Assert.True(verdict.Concerns.Count > 0);
        Assert.Single(verdict.Established);
    }

    [Fact]
    public void PauseRuleOfPillType_DerivedFromType()
    {
        Assert.Equal("regimen", PillPauseManager.PauseRuleOfPillType("orgast"));
        Assert.Equal("standard", PillPauseManager.PauseRuleOfPillType("combined"));
        Assert.Equal("standard", PillPauseManager.PauseRuleOfPillType("mini"));
        Assert.Equal("standard", PillPauseManager.PauseRuleOfPillType("unknown-type"));
    }
}
