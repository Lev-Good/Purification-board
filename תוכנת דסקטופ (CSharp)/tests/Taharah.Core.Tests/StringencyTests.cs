using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class StringencyTests
{
    private static Dictionary<string, bool> On(params string[] keys) =>
        keys.ToDictionary(k => k, _ => true);

    [Fact]
    public void SafekOnaBoth_Off_OnlyOwnOna_On_AlsoMarksPreviousOna()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "reiyah", Ona = OnaType.Day, SafekOna = true }
        };

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false });
        var beinonitAbs = 10000 + 29;
        Assert.Single(off.Prishot[beinonitAbs]); // day onah only

        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false, Stringencies = On("safekOnaBoth") });
        Assert.Equal(2, on.Prishot[beinonitAbs].Count);
        Assert.Contains(on.Prishot[beinonitAbs], p => p.Ona == OnaType.Day);
        Assert.Contains(on.Prishot[beinonitAbs], p => p.Ona == OnaType.Night); // previous onah of a day sighting
    }

    [Fact]
    public void Dilug_AlwaysDetected_OnlyCountedAsConcernWhenOn()
    {
        // A 3-day rising cycle repeated twice: needs >= 2*2 = 4 sightings forming the pattern.
        var days = new List<HDate>
        {
            new(3, 8, 5786), new(4, 9, 5786), new(5, 10, 5786),
            new(3, 11, 5786), new(4, 12, 5786), new(5, 13, 5786)
        };
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>();
        foreach (var d in days) db[d.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day };
        int today = days[^1].Abs() + 5;

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = today, Akirot = false });
        Assert.NotEmpty(off.DilugCandidates); // always exposed for disclosure
        Assert.DoesNotContain(off.StandingVesets, v => v.Kind == "dilug");

        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = today, Akirot = false, Stringencies = On("dilug") });
        Assert.Contains(on.StandingVesets, v => v.Kind == "dilug");
    }

    [Fact]
    public void CheckUprootNonFixed_Off_UprootsImmediately_On_RequiresCheck()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [20000] = new() { Type = "reiyah", Ona = OnaType.Day }
        };
        int beinonitAbs = 20000 + 29;

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = beinonitAbs + 5 });
        Assert.True(off.Prishot[beinonitAbs][0].Uprooted);

        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = beinonitAbs + 5, Stringencies = On("checkUprootNonFixed") });
        Assert.False(on.Prishot[beinonitAbs][0].Uprooted);
    }

    [Fact]
    public void OrZaruaDay31_DefaultOn_CanBeSwitchedOff()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "reiyah", Ona = OnaType.Night }
        };
        int beinonit31Abs = 10000 + 30;

        // Night sighting -> Or Zarua shifts to the day before (beinonit31Abs - 1).
        var defaultOn = VesetEngine.CalculateEngine(db, true, new EngineOptions { Today = 10035, Akirot = false });
        Assert.Contains(defaultOn.Prishot[beinonit31Abs - 1], p => p.Code == "עוא\"ז");

        var off = VesetEngine.CalculateEngine(db, true, new EngineOptions { Today = 10035, Akirot = false, Stringencies = On() /* empty but present */ });
        var stringenciesOff = new Dictionary<string, bool> { ["orZaruaDay31"] = false };
        var explicitOff = VesetEngine.CalculateEngine(db, true, new EngineOptions { Today = 10035, Akirot = false, Stringencies = stringenciesOff });
        Assert.False(explicitOff.Prishot.TryGetValue(beinonit31Abs - 1, out var list) && list.Any(p => p.Code == "עוא\"ז" && p.Reason.Contains("עונה בינונית")));
    }

    [Fact]
    public void HaflagahFromEnd_ChangesAnchorForMultiDaySighting()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "reiyah", Ona = OnaType.Day, DurationDays = 3 },
            [10020] = new() { Type = "reiyah", Ona = OnaType.Day }
        };

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10025, Akirot = false });
        // From-start: diff = 10020 - 10000 = 20, next haflagah at 10040.
        Assert.Contains(off.Prishot[10040], p => p.Code == "עו\"ה");

        var stringenciesOn = new Dictionary<string, bool> { ["haflagahFromEnd"] = true };
        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10025, Akirot = false, Stringencies = stringenciesOn });
        // From-end: anchor = 10000 + 3 - 1 = 10002, diff = 18, next haflagah at 10038.
        Assert.Contains(on.Prishot[10038], p => p.Code == "עו\"ה");
        Assert.DoesNotContain(on.Prishot.GetValueOrDefault(10040) ?? [], p => p.Code == "עו\"ה");
    }

    [Fact]
    public void FrightBedika_Off_NoDemand_On_DemandsCheckForUnresolvedFrightDay()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [20000] = new() { Type = "reiyah", Ona = OnaType.Day, Marks = ["fright"] }
        };
        // The fright mark is on the sighting day itself, so it's already "resolved" by the
        // sighting. Use a separate, unresolved fright day instead.
        var db2 = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [20010] = new() { Type = "reiyah", Ona = OnaType.Day },
            [20050] = new() { Type = "reiyah", Ona = OnaType.Day, Marks = ["fright"] }
        };
        // Actually mark an unrelated day as fright with no sighting/check on it.
        var db3 = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [30000] = new() { Type = "check", Ona = OnaType.Day, Depth = "wipe", Marks = ["fright"] }
        };

        var off = VesetEngine.CalculateEngine(db3, false, new EngineOptions { Today = 30005 });
        Assert.DoesNotContain(off.PendingChecks, p => p.Kind == "fright");

        var stringenciesOn = new Dictionary<string, bool> { ["frightBedika"] = true };
        var on = VesetEngine.CalculateEngine(db3, false, new EngineOptions { Today = 30005, Stringencies = stringenciesOn });
        Assert.Contains(on.PendingChecks, p => p.Kind == "fright" && p.Abs == 30000);
    }

    [Fact]
    public void FrightBedika_ResolvedByProperCheck_NoDemand()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [30000] = new() { Type = "check", Ona = OnaType.Day, Depth = "deep", Marks = ["fright"] }
        };
        var stringenciesOn = new Dictionary<string, bool> { ["frightBedika"] = true };
        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 30005, Stringencies = stringenciesOn });
        Assert.DoesNotContain(on.PendingChecks, p => p.Kind == "fright");
    }

    [Fact]
    public void StainUproots_Off_StainDoesNotClearFixedVeset_On_ItDoes()
    {
        var cheshvan5 = new HDate(5, 8, 5787);
        var kislev5 = new HDate(5, 9, 5787);
        var tevet5 = new HDate(5, 10, 5787);
        var shvat5 = new HDate(5, 11, 5787);
        var adar5 = new HDate(5, 12, 5787);
        var adarII5 = new HDate(5, 13, 5787);

        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [cheshvan5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [kislev5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [tevet5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [shvat5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day, Marks = ["stain"] },
            [adar5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day, Marks = ["stain"] },
            [adarII5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day, Marks = ["stain"] }
        };
        // The "stain" mark alone (no separate sighting/check) needs a day WITHOUT a sighting
        // to be meaningful for uprooting-by-stain; use check-type days marked with a stain
        // instead of reiyah days (a reiyah would itself reset the due-time count).
        var db2 = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [cheshvan5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [kislev5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [tevet5.Abs()] = new() { Type = "reiyah", Ona = OnaType.Day },
            [shvat5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "wipe", Marks = ["stain"] },
            [adar5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "wipe", Marks = ["stain"] },
            [adarII5.Abs()] = new() { Type = "check", Ona = OnaType.Day, Depth = "wipe", Marks = ["stain"] }
        };

        var off = VesetEngine.CalculateEngine(db2, false, new EngineOptions { Today = adarII5.Abs() + 1 });
        Assert.Single(off.Akirot!.Active); // not cleared by stains alone

        var stringenciesOn = new Dictionary<string, bool> { ["stainUproots"] = true };
        var on = VesetEngine.CalculateEngine(db2, false, new EngineOptions { Today = adarII5.Abs() + 1, Stringencies = stringenciesOn });
        Assert.Single(on.Akirot!.Uprooted);
    }

    [Fact]
    public void ChiburLemafrea_Off_ShortHaflagahBreaksPattern_On_LongOneStillEstablishes()
    {
        // Three sightings 30 days apart, then one at 20 days, then back to 30 - the book's
        // own example: the short interruption should not spoil the established long haflagah
        // when the stringency is on.
        int a = 10000, b = a + 30, c = b + 30, d = c + 20, e = d + 30;
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [a] = new() { Type = "reiyah", Ona = OnaType.Day },
            [b] = new() { Type = "reiyah", Ona = OnaType.Day },
            [c] = new() { Type = "reiyah", Ona = OnaType.Day },
            [d] = new() { Type = "reiyah", Ona = OnaType.Day },
            [e] = new() { Type = "reiyah", Ona = OnaType.Day }
        };

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = e + 5, Akirot = false });
        Assert.DoesNotContain(off.StandingVesets, v => v.Kind == "haflagah" && v.Span == 30);

        var stringenciesOn = new Dictionary<string, bool> { ["chiburLemafrea"] = true };
        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = e + 5, Akirot = false, Stringencies = stringenciesOn });
        Assert.Contains(on.StandingVesets, v => v.Kind == "haflagah" && v.Span == 30);
    }

    [Fact]
    public void VesetHagufBedika_Off_NoBodyCheckDemand_On_Demands()
    {
        var sameDay1 = new HDate(5, 8, 5786).Abs();
        var sameDay2 = new HDate(5, 9, 5786).Abs();
        var sameDay3 = new HDate(5, 10, 5786).Abs();
        var nextFifth = new HDate(5, 11, 5786).Abs();
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [sameDay1] = new() { Type = "reiyah", Ona = OnaType.Night, Signs = ["yawn"] },
            [sameDay2] = new() { Type = "reiyah", Ona = OnaType.Night, Signs = ["yawn"] },
            [sameDay3] = new() { Type = "reiyah", Ona = OnaType.Night, Signs = ["yawn"] }
        };

        var defaultOn = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = nextFifth + 3 });
        Assert.Contains(defaultOn.PendingChecks, p => p.Kind == "body");

        var stringenciesOff = new Dictionary<string, bool> { ["vesetHagufBedika"] = false };
        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = nextFifth + 3, Stringencies = stringenciesOff });
        Assert.DoesNotContain(off.PendingChecks, p => p.Kind == "body");
        // But the compound concern itself still stands - only the extra check duty is removed.
        Assert.True(off.Prishot.ContainsKey(nextFifth));
    }

    [Fact]
    public void KaretiUfaletei_Off_OnlyOwnOna_On_AlsoMarksOppositeOna()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "reiyah", Ona = OnaType.Day }
        };
        int beinonitAbs = 10000 + 29;

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false });
        Assert.Single(off.Prishot[beinonitAbs]);

        var stringenciesOn = new Dictionary<string, bool> { ["karetiUfaletei"] = true };
        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false, Stringencies = stringenciesOn });
        Assert.Equal(2, on.Prishot[beinonitAbs].Count);
        Assert.Contains(on.Prishot[beinonitAbs], p => p.Ona == OnaType.Night);
    }

    [Fact]
    public void VesetFromBedika_Off_CheckBloodIgnored_On_CountsAsSighting()
    {
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "check", Ona = OnaType.Day, BloodFound = true }
        };

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false });
        Assert.Empty(off.Reiyot);

        var stringenciesOn = new Dictionary<string, bool> { ["vesetFromBedika"] = true };
        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false, Stringencies = stringenciesOn });
        Assert.Single(on.Reiyot);
        Assert.Equal("bedikaBlood", on.Reiyot[0].Kind);
    }

    [Fact]
    public void SharpFoodOnes_Off_CountsTowardChazaka_On_ExcludedLikeOnes()
    {
        var list = new List<ReiyahEvent>
        {
            new() { Abs = 10000, Ona = OnaType.Day, HDate = new HDate(10000), Kind = "sharp" },
            new() { Abs = 10020, Ona = OnaType.Day, HDate = new HDate(10020), Kind = "sharp" },
            new() { Abs = 10040, Ona = OnaType.Day, HDate = new HDate(10040), Kind = "sharp" },
            new() { Abs = 10060, Ona = OnaType.Day, HDate = new HDate(10060), Kind = "sharp" }
        };

        var offResult = ChazakaManager.AnalyzeChazaka(list, sharpFoodAsOnes: false);
        Assert.Equal(4, offResult.Counted.Count);
        Assert.Single(offResult.Established); // establishes a haflagah/month veset like any other sighting

        var onResult = ChazakaManager.AnalyzeChazaka(list, sharpFoodAsOnes: true);
        Assert.Empty(onResult.Counted);
        Assert.All(onResult.Excluded, e => Assert.Equal("sharp", e.Reason));
    }

    [Fact]
    public void StringencyDefs_AllThirteenPresent_WithDocumentedDefaults()
    {
        Assert.Equal(13, Stringencies.Defs.Count);

        bool DefaultOf(string key) => Stringencies.Defs.First(d => d.Key == key).Default;

        Assert.False(DefaultOf("safekOnaBoth"));
        Assert.False(DefaultOf("dilug"));
        Assert.False(DefaultOf("checkUprootNonFixed"));
        Assert.True(DefaultOf("orZaruaDay31"));
        Assert.True(DefaultOf("lateBedika"));
        Assert.False(DefaultOf("haflagahFromEnd"));
        Assert.False(DefaultOf("frightBedika"));
        Assert.False(DefaultOf("stainUproots"));
        Assert.False(DefaultOf("chiburLemafrea"));
        Assert.True(DefaultOf("vesetHagufBedika"));
        Assert.False(DefaultOf("karetiUfaletei"));
        Assert.False(DefaultOf("vesetFromBedika"));
        Assert.False(DefaultOf("sharpFoodOnes"));
    }

    [Fact]
    public void Normalize_UnknownKeyDropped_MissingKeyFallsBackToDefault()
    {
        var raw = new Dictionary<string, bool> { ["safekOnaBoth"] = true, ["notARealKey"] = true };
        var normalized = Stringencies.Normalize(raw);

        Assert.Equal(13, normalized.Count);
        Assert.True(normalized["safekOnaBoth"]);
        Assert.False(normalized.ContainsKey("notARealKey"));
        Assert.True(normalized["orZaruaDay31"]); // missing key falls back to its own default
    }
}
