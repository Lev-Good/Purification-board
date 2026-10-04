using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class AkiraTests
{
    [Fact]
    public void PeriodsToClear_CalculatesSpanFormulaCorrectly()
    {
        // span * 3 - 2
        Assert.Equal(58, AkiraManager.PeriodsToClear(20));
        Assert.Equal(82, AkiraManager.PeriodsToClear(28));
        Assert.Equal(4, AkiraManager.PeriodsToClear(2));
    }

    [Fact]
    public void NonFixedConcern_PassedWithNoSighting_Uprooted()
    {
        int today = 50000;
        Assert.True(AkiraManager.IsConcernUprooted(today - 1, [], today));
        Assert.False(AkiraManager.IsConcernUprooted(today, [], today));
        Assert.False(AkiraManager.IsConcernUprooted(today + 5, [], today));

        var sightings = new List<ReiyahEvent>
        {
            new() { Abs = today - 1, Ona = OnaType.Day }
        };
        Assert.False(AkiraManager.IsConcernUprooted(today - 1, sightings, today));
    }

    private static ReiyahEvent Reiya(int abs, OnaType ona = OnaType.Day)
        => new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Counted = true };

    private static List<(int Abs, OnaType Ona, string Code)> ProjectFn(EstablishedVeset veset, ReiyahEvent lastCounted)
        => VesetEngine.ProjectFixedVeset(veset, lastCounted, 4000).Select(e => (e.Abs, e.Ona, e.Code)).ToList();

    private sealed class FixedVesetFixture
    {
        public List<ReiyahEvent> Sightings = null!;
        public EstablishedVeset Veset = null!;
        public ChazakaResult Chazaka = null!;
        public HDate Shvat5 = null!;
        public HDate Adar5 = null!;
        public HDate AdarII5 = null!;
    }

    private static FixedVesetFixture BuildFixedVesetFixture()
    {
        var cheshvan5 = new HDate(5, 8, 5787);
        var kislev5 = new HDate(5, 9, 5787);
        var tevet5 = new HDate(5, 10, 5787);
        var sightings = new List<ReiyahEvent>
        {
            Reiya(cheshvan5.Abs()),
            Reiya(kislev5.Abs()),
            Reiya(tevet5.Abs())
        };
        var chazaka = ChazakaManager.AnalyzeChazaka(sightings);
        Assert.Single(chazaka.Established);

        return new FixedVesetFixture
        {
            Sightings = sightings,
            Veset = chazaka.Established[0],
            Chazaka = chazaka,
            Shvat5 = new HDate(5, 11, 5787),
            Adar5 = new HDate(5, 12, 5787),
            AdarII5 = new HDate(5, 13, 5787)
        };
    }

    private static AkirotResult RunAkirot(FixedVesetFixture f, List<CheckRecord> checks, int todayAbs)
        => AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = f.Sightings,
            Established = f.Chazaka.Established,
            LastCounted = f.Chazaka.Counted.LastOrDefault(),
            Checks = checks,
            Today = todayAbs,
            Project = ProjectFn
        });

    [Fact]
    public void FixedVeset_NoChecks_NotUprooted()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [], f.Shvat5.Abs() + 1);

        Assert.Single(result.Active);
        Assert.Empty(result.Uprooted);
        Assert.Equal(0, result.Fixed[0].ClearedCount);
        Assert.Single(result.Fixed[0].Pending);
        Assert.Single(result.PendingChecks);
        Assert.Equal(f.Shvat5.Abs(), result.PendingChecks[0].Abs);
    }

    [Fact]
    public void FixedVeset_OneCheck_NotEnough()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Day, Depth = "deep" }], f.Shvat5.Abs() + 1);

        Assert.Equal(1, result.Fixed[0].ClearedCount);
        Assert.False(result.Fixed[0].Cleared);
        Assert.Empty(result.PendingChecks);
    }

    [Fact]
    public void FixedVeset_TwoChecks_StillNotEnough()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [
            new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Day, Depth = "deep" },
            new() { Abs = f.Adar5.Abs(), Ona = OnaType.Day, Depth = "deep" }
        ], f.Adar5.Abs() + 1);

        Assert.Equal(2, result.Fixed[0].ClearedCount);
        Assert.False(result.Fixed[0].Cleared);
    }

    [Fact]
    public void FixedVeset_ThreeChecks_Uprooted()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [
            new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Day, Depth = "deep" },
            new() { Abs = f.Adar5.Abs(), Ona = OnaType.Day, Depth = "deep" },
            new() { Abs = f.AdarII5.Abs(), Ona = OnaType.Day, Depth = "deep" }
        ], f.AdarII5.Abs() + 1);

        Assert.True(result.Fixed[0].Cleared);
        Assert.Equal("checks", result.Fixed[0].ClearedBy);
        Assert.Single(result.Uprooted);
        Assert.Empty(result.Active);
        Assert.Equal(f.AdarII5.Abs(), result.Fixed[0].ClearedAtAbs);
    }

    [Fact]
    public void FixedVeset_WipeOnly_DoesNotUproot()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [
            new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Day, Depth = "wipe" },
            new() { Abs = f.Adar5.Abs(), Ona = OnaType.Day, Depth = "wipe" },
            new() { Abs = f.AdarII5.Abs(), Ona = OnaType.Day, Depth = "wipe" }
        ], f.AdarII5.Abs() + 1);

        Assert.Equal(0, result.Fixed[0].ClearedCount);
        Assert.False(result.Fixed[0].Cleared);
        Assert.True(result.PendingChecks.Count >= 3);
    }

    [Fact]
    public void FixedVeset_CheckOnWrongOna_DoesNotCover()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Night, Depth = "deep" }], f.Shvat5.Abs() + 1);
        Assert.Equal(0, result.Fixed[0].ClearedCount);
    }

    [Fact]
    public void FixedVeset_LateCheck_StillCounts()
    {
        var f = BuildFixedVesetFixture();
        var result = RunAkirot(f, [new() { Abs = f.Shvat5.Abs() + 3, Ona = OnaType.Night, Depth = "deep" }], f.Shvat5.Abs() + 4);
        Assert.Equal(1, result.Fixed[0].ClearedCount);
    }

    [Fact]
    public void FixedVeset_SightingOnDueTime_ResetsCount()
    {
        var f = BuildFixedVesetFixture();
        var reiyot = f.Sightings.Concat([Reiya(f.Shvat5.Abs())]).ToList();
        var result = AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = reiyot,
            Established = f.Chazaka.Established,
            LastCounted = f.Chazaka.Counted.LastOrDefault(),
            Checks = [new() { Abs = f.Adar5.Abs(), Ona = OnaType.Day, Depth = "deep" }],
            Today = f.Adar5.Abs() + 1,
            Project = ProjectFn
        });

        Assert.Contains(result.Fixed[0].DueTimes, d => d.Abs == f.Shvat5.Abs() && d.Status == "seen");
        Assert.Equal(1, result.Fixed[0].ClearedCount);
    }

    [Fact]
    public void HaflagahVeset_UprootedByIntervalAlone()
    {
        var hafSightings = new List<ReiyahEvent> { Reiya(30000), Reiya(30020), Reiya(30040), Reiya(30060) };
        var hafChazaka = ChazakaManager.AnalyzeChazaka(hafSightings);
        var hafVeset = hafChazaka.Established.FirstOrDefault(v => v.Kind == "haflagah");
        Assert.NotNull(hafVeset);

        var notYet = AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = hafSightings,
            Established = hafChazaka.Established,
            LastCounted = hafChazaka.Counted.LastOrDefault(),
            Checks = [],
            Today = 30060 + 57,
            Project = ProjectFn
        });
        Assert.False(notYet.Fixed.First(f => f.Veset == hafVeset).Cleared);

        var byInterval = AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = hafSightings,
            Established = hafChazaka.Established,
            LastCounted = hafChazaka.Counted.LastOrDefault(),
            Checks = [],
            Today = 30060 + 58,
            Project = ProjectFn
        });
        var cleared = byInterval.Fixed.First(f => f.Veset == hafVeset);
        Assert.True(cleared.Cleared);
        Assert.Equal("interval", cleared.ClearedBy);
        Assert.Equal(58, cleared.Interval!.Needed);
    }

    [Fact]
    public void UprootedVeset_SightingsInOldPattern_RaiseReturnDispute()
    {
        var f = BuildFixedVesetFixture();
        var nissan5 = new HDate(5, 1, 5787);
        var iyar5 = new HDate(5, 2, 5787);
        var reiyot = f.Sightings.Concat([Reiya(nissan5.Abs()), Reiya(iyar5.Abs())]).ToList();

        var result = AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = reiyot,
            Established = f.Chazaka.Established,
            LastCounted = f.Chazaka.Counted.LastOrDefault(),
            Checks =
            [
                new() { Abs = f.Shvat5.Abs(), Ona = OnaType.Day, Depth = "deep" },
                new() { Abs = f.Adar5.Abs(), Ona = OnaType.Day, Depth = "deep" },
                new() { Abs = f.AdarII5.Abs(), Ona = OnaType.Day, Depth = "deep" }
            ],
            Today = iyar5.Abs() + 1,
            Project = ProjectFn
        });

        Assert.Single(result.Uprooted);
        Assert.Single(result.ReturnDispute);
        Assert.Equal(2, result.ReturnDispute[0].Sightings.Count);
        Assert.Equal(f.AdarII5.Abs(), result.ReturnDispute[0].ClearedAtAbs);
    }

    [Fact]
    public void ExtractChecks_FromTupleDb_OnlyChecksExtracted()
    {
        var checkDb = new Dictionary<int, (string Type, OnaType Ona, string Depth, bool Twice, List<string>? Parts)>
        {
            [40000] = ("check", OnaType.Day, "deep", false, null),
            [40001] = ("check", OnaType.Night, "wipe", false, null),
            [40002] = ("check", OnaType.Night, "deep", false, null),
            [40003] = ("reiyah", OnaType.Day, "deep", false, null)
        };
        var extracted = AkiraManager.ExtractChecks(checkDb);
        Assert.Equal(3, extracted.Count);
        Assert.Equal("deep", extracted[0].Depth);
        Assert.Equal("wipe", extracted[1].Depth);
        Assert.Equal("deep", extracted[2].Depth);
    }

    [Fact]
    public void Engine_PastConcernWithNoChecks_MarkedUprootedAndReported()
    {
        var db = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [20000] = ("reiyah", OnaType.Day, null),
            [20035] = ("reiyah", OnaType.Day, null)
        };
        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 20060 });

        Assert.True(result.Prishot.ContainsKey(20029));
        Assert.All(result.Prishot[20029], p => Assert.True(p.Uprooted));
        Assert.Contains("נעקר", result.Prishot[20029][0].Reason);
        Assert.NotEmpty(result.Uprooted);
        Assert.All(result.Prishot.GetValueOrDefault(20064) ?? [], p => Assert.False(p.Uprooted));
        Assert.Contains(result.PendingChecks, p => p.Abs == 20029);
    }

    [Fact]
    public void Engine_AkirotDisabled_NothingUprootedOrDemanded()
    {
        var db = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [20000] = ("reiyah", OnaType.Day, null)
        };
        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 20060, Akirot = false });

        Assert.Empty(result.Uprooted);
        Assert.Empty(result.PendingChecks);
        Assert.True(result.Prishot.ContainsKey(20029));
        Assert.False(result.Prishot[20029][0].Uprooted);
    }

    [Fact]
    public void Engine_FixedVesetUprootedByChecks_OrdinaryConcernsResume()
    {
        var f = BuildFixedVesetFixture();
        var fixedDb = new Dictionary<int, (string Type, OnaType Ona, int? DurationDays)>
        {
            [new HDate(5, 8, 5787).Abs()] = ("reiyah", OnaType.Day, null),
            [new HDate(5, 9, 5787).Abs()] = ("reiyah", OnaType.Day, null),
            [new HDate(5, 10, 5787).Abs()] = ("reiyah", OnaType.Day, null)
        };
        var clearedDb = VesetEngine.CalculateEngine(fixedDb, false, new EngineOptions { Today = f.AdarII5.Abs() + 1 });
        // No checks recorded in this reduced DB shape (checks require a CalendarDayEntry-based
        // db); this scenario is exercised fully via the CalendarDayEntry overload below.
        Assert.NotNull(clearedDb.Akirot);
    }

    [Fact]
    public void Engine_FixedVeset_FullyCheckedInCalendarDb_UprootsAndResumesOrdinaryConcerns()
    {
        var f = BuildFixedVesetFixture();
        var fixedDb = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [new HDate(5, 8, 5787).Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [new HDate(5, 9, 5787).Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [new HDate(5, 10, 5787).Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [f.Shvat5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "deep" },
            [f.Adar5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "deep" },
            [f.AdarII5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "deep" }
        };
        var cleared = VesetEngine.CalculateEngine(fixedDb, false, new EngineOptions { Today = f.AdarII5.Abs() + 1 });
        var clearedCodes = cleared.Prishot.Values.SelectMany(x => x).Select(p => p.Code).ToList();

        Assert.Single(cleared.Akirot!.Uprooted);
        Assert.DoesNotContain("וק\"ח", clearedCodes);
        Assert.Contains("עו\"ב", clearedCodes);

        var pendingDb = new Dictionary<int, VesetEngine.CalendarDayEntry>(fixedDb);
        pendingDb.Remove(f.Shvat5.Abs());
        pendingDb.Remove(f.Adar5.Abs());
        pendingDb.Remove(f.AdarII5.Abs());
        var pending = VesetEngine.CalculateEngine(pendingDb, false, new EngineOptions { Today = f.AdarII5.Abs() + 1 });
        var pendingCodes = pending.Prishot.Values.SelectMany(x => x).Select(p => p.Code).ToList();

        Assert.Contains("וק\"ח", pendingCodes);
        Assert.DoesNotContain("עו\"ב", pendingCodes);
        Assert.Equal(3, pending.PendingChecks.Count);

        var partlyChecked = new Dictionary<int, VesetEngine.CalendarDayEntry>(pendingDb)
        {
            [f.Shvat5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "deep" }
        };
        var partial = VesetEngine.CalculateEngine(partlyChecked, false, new EngineOptions { Today = f.AdarII5.Abs() + 1 });
        Assert.Equal(2, partial.PendingChecks.Count);
        Assert.DoesNotContain(partial.PendingChecks, p => p.Abs == f.Shvat5.Abs());
    }

    [Fact]
    public void FindPendingChecks_DirectCases()
    {
        var concernMap = new Dictionary<int, List<PrishahEntry>>
        {
            [60000] = [new() { Reason = "עונה בינונית", Ona = OnaType.Day, Code = "עו\"ב" }]
        };

        Assert.Single(AkiraManager.FindPendingChecks(concernMap, [], [], 60001, true));
        Assert.Empty(AkiraManager.FindPendingChecks(concernMap, [], [new() { Abs = 60000, Ona = OnaType.Day, Depth = "deep" }], 60001, true));
        Assert.Single(AkiraManager.FindPendingChecks(concernMap, [], [new() { Abs = 60000, Ona = OnaType.Day, Depth = "wipe" }], 60001, true));
        Assert.Empty(AkiraManager.FindPendingChecks(concernMap, [Reiya(60000)], [], 60001, true));
    }
}
