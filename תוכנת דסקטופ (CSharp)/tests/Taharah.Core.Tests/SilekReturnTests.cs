using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class SilekReturnTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();

    private static Dictionary<int, CalendarDayEntry> DbOf(IEnumerable<int> absList, string? kind = null)
    {
        var db = new Dictionary<int, CalendarDayEntry>();
        foreach (var a in absList)
        {
            db[a] = new CalendarDayEntry
            {
                Type = "reiyah",
                Ona = OnaType.Day,
                Kind = kind ?? "regular"
            };
        }
        return db;
    }

    private static List<string> CodesAt(EngineResult result, int abs)
    {
        return result.Prishot.TryGetValue(abs, out var list)
            ? list.Select(p => p.Code).ToList()
            : [];
    }

    private static List<string> AllCodes(EngineResult result)
    {
        return result.Prishot.Values.SelectMany(l => l.Select(p => p.Code)).ToList();
    }

    [Fact]
    public void PregnancyExit_MonthSightings_ReturnsImmediately()
    {
        var monthSightings = new[] { D(15, 1, 5785), D(15, 2, 5785), D(15, 3, 5785) };
        int conception = D(20, 3, 5785);
        int birth = LifeStateManager.AddHebrewMonths(conception, 9);
        var monthDb = DbOf(monthSightings);
        var pregnancyLife = new LifeStateModel { Enabled = true, PregnancyAbs = conception, BirthAbs = birth };

        var afterBirth = CalculateEngine(monthDb, false, new EngineOptions { Today = birth + 60, Life = pregnancyLife });

        Assert.False(afterBirth.Life!.Silek);
        Assert.True(afterBirth.Life.Dormancy.Ended);
        Assert.Single(afterBirth.SilekReturn!.Restored);
        Assert.Equal("month", afterBirth.SilekReturn.Restored[0].Kind);

        Assert.Single(afterBirth.StandingVesets);
        Assert.True(afterBirth.StandingVesets[0].Restored);
        Assert.Equal(birth, afterBirth.StandingVesets[0].RestoredFromAbs);

        // First 15th after birth is marked with וק"ח
        int firstFifteenth = -1;
        var h = new HDate(birth);
        for (int i = 0; i <= 40; i++)
        {
            if (h.Day == 15) { firstFifteenth = h.Abs(); break; }
            h = new HDate(h.Abs() + 1);
        }
        Assert.Contains("וק\"ח", CodesAt(afterBirth, firstFifteenth));

        // No veset dates before birth
        Assert.DoesNotContain(afterBirth.Prishot.Keys, abs => abs < birth);

        // Early concerns do not come back
        var earlyCodes = AllCodes(afterBirth);
        Assert.DoesNotContain("עו\"ב", earlyCodes);
        Assert.DoesNotContain("יו\"ח", earlyCodes);

        // Reported as suppressed
        Assert.Contains(afterBirth.Suppressed, s => s.Why == "silek" && !string.IsNullOrEmpty(s.Text));
    }

    [Fact]
    public void PregnancyExit_HaflagahSightings_WaitsForSighting()
    {
        int hafBase = D(1, 1, 5785);
        var hafSightings = new[] { hafBase, hafBase + 20, hafBase + 40, hafBase + 60 };
        int hafConception = hafBase + 70;
        int hafBirth = LifeStateManager.AddHebrewMonths(hafConception, 9);
        var hafDb = DbOf(hafSightings);
        var hafLife = new LifeStateModel { Enabled = true, PregnancyAbs = hafConception, BirthAbs = hafBirth };

        var hafWaiting = CalculateEngine(hafDb, false, new EngineOptions { Today = hafBirth + 40, Life = hafLife });
        Assert.Single(hafWaiting.SilekReturn!.Waiting);
        Assert.Empty(hafWaiting.SilekReturn.Restored);
        Assert.Empty(hafWaiting.StandingVesets);
        Assert.DoesNotContain("וק\"ה", AllCodes(hafWaiting));
        Assert.Contains(hafWaiting.Suppressed, s => s.Why == "restored");

        int hafSeenAbs = hafBirth + 12;
        var hafDbAfter = new Dictionary<int, CalendarDayEntry>(hafDb)
        {
            [hafSeenAbs] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day }
        };

        var hafAfter = CalculateEngine(hafDbAfter, false, new EngineOptions { Today = hafBirth + 40, Life = hafLife });
        Assert.Single(hafAfter.SilekReturn!.Restored);
        Assert.Equal(hafSeenAbs, hafAfter.SilekReturn.Restored[0].RestoredAnchorAbs);
        Assert.Contains("וק\"ה", CodesAt(hafAfter, hafSeenAbs + 20));
        Assert.Contains(hafAfter.StandingVesets, v => v.Restored && v.Kind == "haflagah");
    }

    [Fact]
    public void TwinVesets_ReturnedAndPostSilek_BothStandWithDisputeNote()
    {
        var monthSightings = new[] { D(15, 1, 5785), D(15, 2, 5785), D(15, 3, 5785) };
        int conception = D(20, 3, 5785);
        int birth = LifeStateManager.AddHebrewMonths(conception, 9);
        var pregnancyLife = new LifeStateModel { Enabled = true, PregnancyAbs = conception, BirthAbs = birth };

        var postBirthSightings = new[] { D(5, 1, 5787), D(5, 2, 5787), D(5, 3, 5787) };
        var twinDb = DbOf(monthSightings.Concat(postBirthSightings));

        var twinData = CalculateEngine(twinDb, false, new EngineOptions
        {
            Today = postBirthSightings[2] + 40,
            Life = pregnancyLife
        });

        Assert.Equal(2, twinData.StandingVesets.Count);
        Assert.Contains(twinData.StandingVesets, v => v.Restored);
        Assert.Contains(twinData.StandingVesets, v => !v.Restored);
        Assert.Contains(twinData.SilekReturn!.Notes, n => n.Level == "dispute" && n.Text.Contains("לשאול רב"));
    }

    [Fact]
    public void NoFixedVesetBeforeSilek_NothingReturns()
    {
        var twoSightingsDb = DbOf([D(10, 1, 5785), D(10, 2, 5785)]);
        int twoConception = D(10, 3, 5785) + 5;
        int twoBirth = LifeStateManager.AddHebrewMonths(twoConception, 9);

        var withoutFixed = CalculateEngine(twoSightingsDb, false, new EngineOptions
        {
            Today = twoBirth + 40,
            Life = new LifeStateModel { Enabled = true, PregnancyAbs = twoConception, BirthAbs = twoBirth }
        });

        Assert.Empty(withoutFixed.SilekReturn!.Returned);
        Assert.Contains(withoutFixed.SilekReturn.Notes, n => n.Title.Contains("לא היתה לה וסת קבועה"));
        Assert.Empty(AllCodes(withoutFixed));

        var withoutLife = CalculateEngine(twoSightingsDb, false, new EngineOptions { Today = twoBirth + 40 });
        Assert.NotEmpty(AllCodes(withoutLife));
    }

    [Fact]
    public void Nursing_DormancyDuration_AndChain()
    {
        var monthSightings = new[] { D(15, 1, 5785), D(15, 2, 5785), D(15, 3, 5785) };
        int nursingBirth = D(10, 3, 5785) + 200;
        var nursingLife = new LifeStateModel { Enabled = true, BirthAbs = nursingBirth, Nursing = true, NursingLenient = true };
        int nursingUntil = LifeStateManager.AddHebrewMonths(nursingBirth, 24);
        var nursingDb = DbOf(monthSightings);

        var insideNursing = CalculateEngine(nursingDb, false, new EngineOptions { Today = nursingBirth + 100, Life = nursingLife });
        Assert.True(insideNursing.Life!.Silek);
        Assert.Empty(insideNursing.SilekReturn!.Restored);
        Assert.Empty(AllCodes(insideNursing));

        var afterNursing = CalculateEngine(nursingDb, false, new EngineOptions { Today = nursingUntil + 40, Life = nursingLife });
        Assert.True(afterNursing.Life!.Dormancy.Ended);
        Assert.Single(afterNursing.SilekReturn!.Restored);
        Assert.Equal(nursingUntil, afterNursing.SilekReturn.Restored[0].RestoredFromAbs);
        Assert.DoesNotContain(afterNursing.Prishot.Keys, abs => abs > nursingBirth && abs < nursingUntil);

        // Chain pregnancy + nursing
        int chainConception = D(15, 1, 5785) + 5;
        int chainBirth = LifeStateManager.AddHebrewMonths(chainConception, 9);
        int chainUntil = LifeStateManager.AddHebrewMonths(chainBirth, 24);
        var chain = CalculateEngine(nursingDb, false, new EngineOptions
        {
            Today = chainUntil + 40,
            Life = new LifeStateModel
            {
                Enabled = true,
                PregnancyAbs = chainConception,
                BirthAbs = chainBirth,
                Nursing = true,
                NursingLenient = true
            }
        });

        Assert.Equal(2, chain.Life!.Dormancy.Windows.Count);
        Assert.True(chain.Life.Dormancy.Ended);
        Assert.Single(chain.SilekReturn!.Restored);
        Assert.Equal(chainUntil, chain.SilekReturn.Restored[0].RestoredFromAbs);
    }

    [Fact]
    public void PillPause_ReturnToPrePillFixed()
    {
        var prePill = new[] { D(10, 1, 5785), D(10, 2, 5785), D(10, 3, 5785) };
        int pillStart = D(10, 3, 5785) + 20;
        int pillEnd = pillStart + 200;
        var pillEraSightings = new[] { D(3, 4, 5785), D(3, 5, 5785), D(3, 6, 5785) };

        var pillDb = DbOf(prePill);
        foreach (var p in pillEraSightings)
        {
            pillDb[p] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Kind = "pills" };
        }

        var pillsLife = new LifeStateModel
        {
            Enabled = true,
            Pills = [new PillPeriod { StartAbs = pillStart, EndAbs = pillEnd, Type = "combined" }]
        };

        var onPills = CalculateEngine(pillDb, false, new EngineOptions { Today = pillStart + 50, Life = pillsLife });
        Assert.Empty(onPills.SilekReturn!.Returned);
        Assert.Contains(onPills.StandingVesets, v => v.DayOfMonth == 3);

        var afterPills = CalculateEngine(pillDb, false, new EngineOptions { Today = pillEnd + 40, Life = pillsLife });
        Assert.Single(afterPills.SilekReturn!.Restored);
        Assert.Equal(10, afterPills.SilekReturn.Restored[0].DayOfMonth);
        Assert.Equal(pillEnd + 1, afterPills.SilekReturn.Restored[0].RestoredFromAbs);
        Assert.DoesNotContain(afterPills.StandingVesets, v => v.DayOfMonth == 3);

        var displaced = afterPills.Suppressed.FirstOrDefault(s => s.Why == "pills");
        Assert.NotNull(displaced);
        Assert.Contains("ג", displaced.Reason);

        Assert.DoesNotContain(afterPills.Prishot.Keys, abs => abs > pillStart && abs < pillEnd + 1);

        int firstTenth = -1;
        var h = new HDate(pillEnd + 1);
        for (int i = 0; i <= 40; i++)
        {
            if (h.Day == 10) { firstTenth = h.Abs(); break; }
            h = new HDate(h.Abs() + 1);
        }
        Assert.Contains("וק\"ח", CodesAt(afterPills, firstTenth));
    }

    [Fact]
    public void LifeVerdict_DormancyWindow_AndVesetKey_Units()
    {
        int conception = D(20, 3, 5785);
        int birth = LifeStateManager.AddHebrewMonths(conception, 9);
        var lifeVerdict = LifeStateManager.AnalyzeLifeState(
            new LifeStateModel { Enabled = true, PregnancyAbs = conception, BirthAbs = birth },
            null,
            birth + 10);

        Assert.Single(lifeVerdict.Dormancy.Windows);
        Assert.Equal(birth, lifeVerdict.Dormancy.Windows[0].UntilAbs);
        Assert.Equal(conception + 90, lifeVerdict.Dormancy.Windows[0].FromAbs);
        Assert.True(lifeVerdict.Dormancy.Ended);
        Assert.Equal(birth, lifeVerdict.Dormancy.UpToAbs);

        Assert.True(lifeVerdict.Dormancy.DisqualifiesEstablishment(conception + 50));
        Assert.True(lifeVerdict.Dormancy.DisqualifiesEstablishment(conception + 100));
        Assert.False(lifeVerdict.Dormancy.DisqualifiesEstablishment(birth + 5));

        var interlude = SilekReturnManager.ReturnInterlude(lifeVerdict, birth + 10);
        Assert.NotNull(interlude);
        Assert.Equal(conception + 90, interlude.FromAbs);

        var key1 = SilekReturnManager.VesetKey(new EstablishedVeset { Kind = "month", Ona = OnaType.Day, DayOfMonth = 15 });
        var key2 = SilekReturnManager.VesetKey(new EstablishedVeset { Kind = "month", Ona = OnaType.Day, DayOfMonth = 15 });
        Assert.Equal(key1, key2);

        Assert.True(SilekReturnManager.IsPillEraVeset(new EstablishedVeset { EstablishedBy = [500, 520, 540] }, 400));
        Assert.False(SilekReturnManager.IsPillEraVeset(new EstablishedVeset { EstablishedBy = [300, 520, 540] }, 400));
    }
}
