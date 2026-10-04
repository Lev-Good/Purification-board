using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class VesetGufTests
{
    private static ReiyahEvent SignReiyah(int abs, OnaType ona, string[] signs, string kind = "regular") =>
        new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Signs = [.. signs], Kind = kind };

    [Fact]
    public void BodySigns_DefinitionsComplete()
    {
        Assert.True(VesetGufManager.BodySigns.Count >= 8);
        Assert.Contains(VesetGufManager.BodySigns, s => s.Code == "yawn");
        Assert.Contains(VesetGufManager.BodySigns, s => s.Code == "faceSpots");
        Assert.Equal("פיהוק", VesetGufManager.BodySignLabel("yawn"));
        Assert.Equal("nope", VesetGufManager.BodySignLabel("nope"));
    }

    [Fact]
    public void AnalyzeBodyVeset_NoSigns_NotConfigured()
    {
        var verdict = VesetGufManager.AnalyzeBodyVeset([new ReiyahEvent { Abs = 10000, Ona = OnaType.Day, HDate = new HDate(10000) }]);
        Assert.False(verdict.Configured);
    }

    [Fact]
    public void AnalyzeBodyVeset_Once_PendingBodyVeset()
    {
        var verdict = VesetGufManager.AnalyzeBodyVeset([SignReiyah(10000, OnaType.Day, ["yawn"])]);
        Assert.True(verdict.Configured);
        Assert.Single(verdict.BySign);
        Assert.Equal(1, verdict.BySign[0].Count);
        Assert.False(verdict.BySign[0].Fixed);
        Assert.Single(verdict.PendingBody);
        Assert.Empty(verdict.FixedBody);
    }

    [Fact]
    public void AnalyzeBodyVeset_ThreeTimes_FixedBodyVeset()
    {
        var list = new List<ReiyahEvent>
        {
            SignReiyah(10000, OnaType.Day, ["yawn"]),
            SignReiyah(10030, OnaType.Day, ["yawn"]),
            SignReiyah(10061, OnaType.Day, ["yawn"])
        };

        var verdict = VesetGufManager.AnalyzeBodyVeset(list);
        Assert.Single(verdict.FixedBody);
        Assert.Equal("yawn", verdict.FixedBody[0].Code);
        Assert.Equal(3, verdict.FixedBody[0].Count);
        Assert.True(verdict.FixedBody[0].Fixed);
        Assert.Empty(verdict.Compound);
    }

    private static Dictionary<int, VesetEngine.CalendarDayEntry> DbOf(IEnumerable<ReiyahEvent> list)
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>();
        foreach (var r in list)
        {
            db[r.Abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = r.Ona, Kind = r.Kind, Signs = r.Signs };
        }
        return db;
    }

    [Fact]
    public void CompoundMonthVeset_EstablishedByThreeConsecutiveSignedSightings_ReplacesPlainDaysVeset()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var db = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay3, OnaType.Night, ["yawn"])
        ]);

        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = sameDay3 + 5, Akirot = false });

        Assert.Single(result.BodyVeset!.Compound);
        Assert.Equal("month", result.BodyVeset.Compound[0].Kind);
        Assert.Equal(5, result.BodyVeset.Compound[0].DayOfMonth);
        Assert.Equal(3, result.BodyVeset.Compound[0].EstablishedBy.Count);

        var nextFifth = new HDate(5, 11, 5786).Abs();
        Assert.Contains(result.Prishot[nextFifth], p => p.Code == VesetGufManager.CompoundMonthCode);
        Assert.Contains(result.Prishot[nextFifth], p => p.Reason.Contains("מורכב") && p.Reason.Contains("פיהוק"));
        Assert.Contains(result.Prishot[nextFifth], p => p.Ona == OnaType.Night);

        // The plain days-veset steps aside for the compound.
        Assert.Empty(result.StandingVesets);
        Assert.Contains(result.Suppressed, s => s.Why == "compound");
    }

    [Fact]
    public void CompoundMonthVeset_NoOrZaruaAddedForIt_ButControlDaysVesetGetsIt()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var nextFifth = new HDate(5, 11, 5786).Abs();

        var compoundDb = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay3, OnaType.Night, ["yawn"])
        ]);
        var withOrZarua = VesetEngine.CalculateEngine(compoundDb, true, new EngineOptions { Today = sameDay3 + 5, Akirot = false });

        var controlDb = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            new ReiyahEvent { Abs = sameDay3, Ona = OnaType.Night, HDate = new HDate(sameDay3) }
        ]);
        var control = VesetEngine.CalculateEngine(controlDb, true, new EngineOptions { Today = sameDay3 + 5, Akirot = false });

        Assert.Contains(withOrZarua.Prishot[nextFifth], p => p.Code == VesetGufManager.CompoundMonthCode);

        bool HasOrZaruaBefore(EngineResult r) =>
            r.Prishot.TryGetValue(nextFifth - 1, out var list) &&
            list.Any(p => p.Code == "עוא\"ז" && p.Reason.Contains("וסת קבוע"));

        Assert.False(HasOrZaruaBefore(withOrZarua));
        Assert.True(HasOrZaruaBefore(control));
    }

    [Fact]
    public void SightingOnVesetDayWithoutSign_BreaksCompoundEstablishment()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var sameDay4 = new HDate(5, 11, 5786).Abs();

        var db = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            new ReiyahEvent { Abs = sameDay2, Ona = OnaType.Night, HDate = new HDate(sameDay2) },
            SignReiyah(sameDay3, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay4, OnaType.Night, ["yawn"])
        ]);

        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = sameDay4 + 5, Akirot = false });

        Assert.Empty(result.BodyVeset!.Compound);
        Assert.Single(result.BodyVeset.BySign);
        Assert.Equal(3, result.BodyVeset.BySign[0].Count);
        // The day itself was proven to be the cause here, so a plain days-veset stands.
        Assert.Single(result.StandingVesets);
        Assert.Equal("month", result.StandingVesets[0].Kind);
    }

    [Fact]
    public void CompoundHaflagahVeset_EstablishedByFourEqualSignedIntervals()
    {
        int haf1 = 40000, haf2 = 40020, haf3 = 40040, haf4 = 40060;
        var db = DbOf([
            SignReiyah(haf1, OnaType.Day, ["sneeze"]),
            SignReiyah(haf2, OnaType.Day, ["sneeze"]),
            SignReiyah(haf3, OnaType.Day, ["sneeze"]),
            SignReiyah(haf4, OnaType.Day, ["sneeze"])
        ]);

        var noChazaka = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = haf4 + 5, Chazaka = false, Akirot = false });
        var hafCompound = noChazaka.BodyVeset!.Compound.FirstOrDefault(c => c.Kind == "haflagah");
        Assert.NotNull(hafCompound);
        Assert.Equal(20, hafCompound!.Span);
        Assert.Equal(21, hafCompound.SpanLabel);
        Assert.Equal(4, hafCompound.EstablishedBy.Count);
        Assert.Contains(noChazaka.Prishot[haf4 + 20], p => p.Code == VesetGufManager.CompoundHaflagahCode);

        var withChazaka = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = haf4 + 5, Akirot = false });
        Assert.Empty(withChazaka.StandingVesets);
        Assert.Contains(withChazaka.Suppressed, s => s.Why == "compound");
    }

    [Fact]
    public void SignsOnUncountedSightings_EstablishNothing_ButAreReported()
    {
        var db = DbOf([
            SignReiyah(10000, OnaType.Day, ["yawn"], "ones"),
            SignReiyah(10030, OnaType.Day, ["yawn"], "ones"),
            SignReiyah(10061, OnaType.Day, ["yawn"], "ones")
        ]);

        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10070, Akirot = false });

        Assert.Empty(result.BodyVeset!.BySign);
        Assert.Empty(result.BodyVeset.FixedBody);
        Assert.Equal(3, result.BodyVeset.UnauditedSigns.Count);
    }

    [Fact]
    public void CompoundVeset_DoesNotSuppressOrdinaryConcerns()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var db = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay3, OnaType.Night, ["yawn"])
        ]);
        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = sameDay3 + 5, Akirot = false });

        Assert.DoesNotContain(result.Suppressed, s => s.Text != null && s.Text.Contains("מכוח וסת קבוע"));
        Assert.Contains(result.Prishot[sameDay3 + 29], p => p.Code == "עו\"ב");
    }

    [Fact]
    public void CompoundVesetTime_PassedWithNoCheck_DemandsPendingCheckOfKindBody()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var nextFifth = new HDate(5, 11, 5786).Abs();
        var db = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay3, OnaType.Night, ["yawn"])
        ]);

        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = nextFifth + 3 });
        var bodyDuties = result.PendingChecks.Where(p => p.Kind == "body").ToList();

        Assert.Single(bodyDuties);
        Assert.Equal(nextFifth, bodyDuties[0].Abs);
        Assert.Equal(VesetGufManager.CompoundMonthCode, bodyDuties[0].Code);
        Assert.Contains("פיהוק", bodyDuties[0].Reason);
    }

    [Fact]
    public void CompoundVesetTime_ProperCheckClarifiesIt_WipeOnlyDoesNot()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var nextFifth = new HDate(5, 11, 5786).Abs();
        var baseDb = DbOf([
            SignReiyah(sameDay1, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay2, OnaType.Night, ["yawn"]),
            SignReiyah(sameDay3, OnaType.Night, ["yawn"])
        ]);

        var checkedDb = new Dictionary<int, VesetEngine.CalendarDayEntry>(baseDb)
        {
            [nextFifth] = new() { Type = "check", Ona = OnaType.Night, Depth = "deep" }
        };
        var checked_ = VesetEngine.CalculateEngine(checkedDb, false, new EngineOptions { Today = nextFifth + 3 });
        Assert.DoesNotContain(checked_.PendingChecks, p => p.Kind == "body");

        var wipeDb = new Dictionary<int, VesetEngine.CalendarDayEntry>(baseDb)
        {
            [nextFifth] = new() { Type = "check", Ona = OnaType.Night, Depth = "wipe" }
        };
        var wiped = VesetEngine.CalculateEngine(wipeDb, false, new EngineOptions { Today = nextFifth + 3 });
        Assert.Contains(wiped.PendingChecks, p => p.Kind == "body" && p.Abs == nextFifth);
    }
}
