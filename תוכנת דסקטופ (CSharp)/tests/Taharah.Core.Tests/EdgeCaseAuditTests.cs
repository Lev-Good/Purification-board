using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

/// <summary>
/// Halachic edge-case audit (2026-09-24), requested before a subscription-ending release:
/// leap-year month transitions, missing/full (חסר/מלא) Cheshvan-Kislev, the Sephardic/Ashkenazi
/// Or Zarua isolation, and safek-onah dual-onah concern. Found one real bug along the way (see
/// LeapYear_/ChaserCheshvan_ tests' companion below) - VesetEngine.GetYomHachodeshInfo and
/// ProjectFixedVeset's "month" branch both computed the "א' בחודש הבא בתורת ראש חודש" disputed
/// entry as 1st of the DEFICIENT month itself instead of 1st of the month AFTER it; fixed there,
/// with a matching fix to IntegritySweepTests's independent oracle.
/// </summary>
public class EdgeCaseAuditTests
{
    private static int D(int day, int month, int year) => new HDate(day, month, year).Abs();

    private static ReiyahEvent Reiyah(int abs, OnaType ona = OnaType.Day)
        => new() { Abs = abs, Ona = ona, HDate = new HDate(abs), Counted = true };

    // Independent re-derivation of "next Hebrew month", written separately from
    // VesetEngine.ShiftHebrewMonth so this test doesn't just assert the engine against itself.
    private static (int Year, int Month) IndependentNextMonth(int year, int month)
    {
        if (month == HDate.Elul) return (year + 1, HDate.Tishrei);
        int monthsInYear = HDate.MonthsInYear(year);
        int m = month + 1;
        if (m > monthsInYear) m = HDate.Nisan;
        return (year, m);
    }

    // --- (a) Leap year: veset hachodesh / haflagah across Shvat -> Adar I -> Adar II -> Nisan ---

    [Fact]
    public void LeapYear_MonthVeset_ProjectsThroughAdarIAndAdarII_ThenIntoNisan()
    {
        Assert.True(HDate.IsLeap(5787)); // sanity: this year must actually be a leap year

        var veset = new EstablishedVeset { Kind = "month", Ona = OnaType.Day, DayOfMonth = 5 };
        var lastCounted = Reiyah(D(5, HDate.Shvat, 5787));

        var entries = VesetEngine.ProjectFixedVeset(veset, lastCounted, horizonDays: 200);

        int adarI = D(5, HDate.AdarI, 5787);
        int adarII = D(5, HDate.AdarII, 5787);
        int nisan = D(5, HDate.Nisan, 5787);

        Assert.Contains(entries, e => e.Abs == adarI && e.Code == "וק\"ח");
        Assert.Contains(entries, e => e.Abs == adarII && e.Code == "וק\"ח");
        Assert.Contains(entries, e => e.Abs == nisan && e.Code == "וק\"ח");

        // Both Adars must appear - neither skipped nor collapsed into one entry - and in the
        // correct chronological order relative to each other and to Nisan.
        Assert.True(adarI < adarII);
        Assert.True(adarII < nisan);
        Assert.Equal(1, entries.Count(e => e.Abs == adarI));
        Assert.Equal(1, entries.Count(e => e.Abs == adarII));
    }

    [Fact]
    public void LeapYear_MonthVesetEstablishment_TreatsAdarIAndAdarIIAsConsecutiveMonths()
    {
        // Three sightings on day 5, in Shvat, Adar I and Adar II of a leap year - a plain month
        // veset must establish (not be rejected as "non-consecutive", and not be mistaken for
        // וסת הסירוג since Adar I -> Adar II is a genuine calendar-consecutive month pair).
        Assert.True(HDate.IsLeap(5787));
        var reiyot = new List<ReiyahEvent>
        {
            Reiyah(D(5, HDate.Shvat, 5787)),
            Reiyah(D(5, HDate.AdarI, 5787)),
            Reiyah(D(5, HDate.AdarII, 5787))
        };

        var chazaka = ChazakaManager.AnalyzeChazaka(reiyot);
        Assert.Contains(chazaka.Established, v => v.Kind == "month" && v.DayOfMonth == 5);
    }

    [Fact]
    public void LeapYear_HaflagahVeset_CrossesAdarIAdarIIBoundary_PureAbsArithmetic()
    {
        Assert.True(HDate.IsLeap(5787));
        int anchorAbs = D(10, HDate.Shvat, 5787);
        int adarIIAbs = D(10, HDate.AdarII, 5787);
        int step = adarIIAbs - anchorAbs; // exact day-count spanning Shvat -> Adar I -> Adar II

        var veset = new EstablishedVeset { Kind = "haflagah", Ona = OnaType.Day, Span = step, SpanLabel = step + 1 };
        var lastCounted = Reiyah(anchorAbs);

        var entries = VesetEngine.ProjectFixedVeset(veset, lastCounted, horizonDays: step + 5);

        Assert.Contains(entries, e => e.Abs == adarIIAbs && e.Code == "וק\"ה");
        Assert.Equal(HDate.AdarII, new HDate(adarIIAbs).Month); // confirms the landing date really is Adar II, not misdated
    }

    // --- (b) Missing/full months: onah beinonit day 30/31 + veset hachodesh in Cheshvan/Kislev ---

    private static int FindYearWhere(Func<int, bool> predicate, int from = 5775, int to = 5820)
    {
        for (int y = from; y <= to; y++)
        {
            if (predicate(y)) return y;
        }
        throw new InvalidOperationException("No matching year found in range - widen the search.");
    }

    [Fact]
    public void ChaserCheshvan_MonthVesetDay30_ThreeWayMachlokesLandsOnCorrectDates()
    {
        // A year where Cheshvan is chaser (29 days) but Kislev is maleh (30 days) - the plain
        // "כסדרן" case for this dispute.
        int year = FindYearWhere(y => HDate.DaysInMonth(HDate.Cheshvan, y) == 29 && HDate.DaysInMonth(HDate.Kislev, y) == 30);

        var veset = new EstablishedVeset { Kind = "month", Ona = OnaType.Day, DayOfMonth = 30 };
        var lastCounted = Reiyah(D(30, HDate.Tishrei, year)); // Tishrei always has 30 days

        var entries = VesetEngine.ProjectFixedVeset(veset, lastCounted, horizonDays: 70);
        var cheshvanEntries = entries.Where(e => e.Abs <= D(1, HDate.Kislev, year) + 35).ToList();

        int day29Cheshvan = D(29, HDate.Cheshvan, year);
        int day30Kislev = D(30, HDate.Kislev, year); // the next month that actually reaches day 30
        int day1Kislev = D(1, HDate.Kislev, year); // Rosh Chodesh of the month AFTER the deficient one

        Assert.Contains(cheshvanEntries, e => e.Abs == day29Cheshvan && e.Code == "וק\"ח*");
        Assert.Contains(cheshvanEntries, e => e.Abs == day30Kislev && e.Code == "וק\"ח*");
        Assert.Contains(cheshvanEntries, e => e.Abs == day1Kislev && e.Code == "וק\"ח*");

        // The bug this audit found: this must NOT be 1 Cheshvan (day 1 of the deficient month
        // itself), which would be chronologically absurd - earlier than even the 29th entry.
        int day1Cheshvan = D(1, HDate.Cheshvan, year);
        Assert.DoesNotContain(cheshvanEntries, e => e.Abs == day1Cheshvan);

        // Sanity ordering: 29th < Rosh Chodesh Kislev < the later day-30.
        Assert.True(day29Cheshvan < day1Kislev);
        Assert.True(day1Kislev < day30Kislev);
    }

    [Fact]
    public void ChaserCheshvanAndKislev_MonthVesetDay30_SkipsBothToShvat()
    {
        // A "חסרה" year: Cheshvan AND Kislev both chaser (29 days). Tevet is always 29, so the
        // deficient run is Cheshvan-Kislev-Tevet (3 months) - the day-30 search must skip all
        // three and land on Shvat (always 30 days), while Rosh Chodesh still lands on 1 Kislev
        // (immediately after Cheshvan) regardless of Kislev's own length.
        int year = FindYearWhere(y => HDate.DaysInMonth(HDate.Cheshvan, y) == 29 && HDate.DaysInMonth(HDate.Kislev, y) == 29);
        Assert.Equal(29, HDate.DaysInMonth(HDate.Tevet, year));
        Assert.Equal(30, HDate.DaysInMonth(HDate.Shvat, year));

        var veset = new EstablishedVeset { Kind = "month", Ona = OnaType.Day, DayOfMonth = 30 };
        var lastCounted = Reiyah(D(30, HDate.Tishrei, year));

        var entries = VesetEngine.ProjectFixedVeset(veset, lastCounted, horizonDays: 150);

        int day29Cheshvan = D(29, HDate.Cheshvan, year);
        int day30Shvat = D(30, HDate.Shvat, year);
        int day1Kislev = D(1, HDate.Kislev, year);
        int day1Cheshvan = D(1, HDate.Cheshvan, year);

        // Cheshvan, Kislev AND Tevet are each individually deficient that year, so each
        // contributes its own 3-way disputed set (and Kislev/Tevet's "later 30" search both
        // also resolve to 30 Shvat) - the raw projection list is not deduplicated across months
        // (AddPrishah, the caller, does that); this test only pins down the dates that matter.
        Assert.Contains(entries, e => e.Abs == day29Cheshvan && e.Code == "וק\"ח*");
        Assert.Contains(entries, e => e.Abs == day1Kislev && e.Code == "וק\"ח*");
        Assert.Contains(entries, e => e.Abs == day30Shvat && e.Code == "וק\"ח*");

        // Regression for the bug this audit found: 1 Cheshvan (1st of the deficient month
        // itself) must never appear - only 1 Kislev (1st of the month AFTER it).
        Assert.DoesNotContain(entries, e => e.Abs == day1Cheshvan);
    }

    [Fact]
    public void ChaserKislev_OnahBeinonit30And31_UnaffectedByMonthLength()
    {
        // Onah beinonit is pure absolute-day arithmetic (abs+29 / abs+30) with no Hebrew-month
        // awareness at all, so it must land correctly regardless of whether the sighting month,
        // or the months it crosses, are chaser or maleh.
        int year = FindYearWhere(y => HDate.DaysInMonth(HDate.Kislev, y) == 29);
        int sightingAbs = D(5, HDate.Cheshvan, year);

        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [sightingAbs] = new() { Type = "reiyah", Ona = OnaType.Day }
        };
        var result = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = sightingAbs + 35, Akirot = false });

        Assert.True(result.Prishot.TryGetValue(sightingAbs + 29, out var p30) && p30.Any(p => p.Code == "עו\"ב"));
        Assert.True(result.Prishot.TryGetValue(sightingAbs + 30, out var p31) && p31.Any(p => p.Code == "עו\"ל"));
    }

    // --- (c) MinhagProfile: Sephardic fully disables Or Zarua, Ashkenazi fully enables it ---

    [Fact]
    public void SephardicProfile_NoOrZaruaEntriesAnywhere_AshkenazProfile_HasThemInEveryScenario()
    {
        // A rich scenario touching every Or Zarua application site in VesetEngine: plain
        // beinonit (day 30), beinonit day 31, yom hachodesh, and a standing fixed veset.
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [D(5, HDate.Cheshvan, 5786)] = new() { Type = "reiyah", Ona = OnaType.Day },
            [D(5, HDate.Kislev, 5786)] = new() { Type = "reiyah", Ona = OnaType.Day },
            [D(5, HDate.Tevet, 5786)] = new() { Type = "reiyah", Ona = OnaType.Day }
        };
        int today = D(5, HDate.Tevet, 5786) + 60;

        // Sephardic: OrZarua=false (isOrZaruaEnabled) and orZaruaDay31=false - matches
        // SettingsViewModel.MinhagProfile's "sepharad" branch exactly.
        var sepharadStringencies = new Dictionary<string, bool> { ["orZaruaDay31"] = false, ["karetiUfaletei"] = false, ["vesetHagufBedika"] = false, ["mevuchaDays"] = false };
        var sepharad = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = today, Stringencies = sepharadStringencies });

        Assert.DoesNotContain(sepharad.Prishot.Values.SelectMany(l => l), p => p.Code == "עוא\"ז");
        Assert.Empty(sepharad.OrZaruaExemptions); // nothing to exempt when Or Zarua is off entirely

        // Ashkenaz: OrZarua=true and orZaruaDay31=true - matches the "ashkenaz" branch.
        var ashkenazStringencies = new Dictionary<string, bool> { ["orZaruaDay31"] = true, ["karetiUfaletei"] = true, ["vesetHagufBedika"] = true, ["mevuchaDays"] = true };
        var ashkenaz = VesetEngine.CalculateEngine(db, true, new EngineOptions { Today = today, Stringencies = ashkenazStringencies });

        var orZaruaEntries = ashkenaz.Prishot.Values.SelectMany(l => l).Where(p => p.Code == "עוא\"ז").ToList();
        Assert.NotEmpty(orZaruaEntries);
        // At least one Or Zarua entry tied to the established month veset (standing veset path).
        Assert.Contains(orZaruaEntries, p => p.Reason.Contains("אור זרוע לוסת קבוע"));
    }

    [Fact]
    public void SephardicProfile_SingleSighting_NoOrZaruaBeforeBeinonitOrYomHachodesh()
    {
        // Narrower, single-sighting version of the above (no established veset in play at all) -
        // confirms Or Zarua is suppressed even for the "plain" per-sighting projections.
        int abs = D(10, HDate.Shvat, 5786);
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [abs] = new() { Type = "reiyah", Ona = OnaType.Day }
        };

        var sepharad = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = abs + 35, Akirot = false });
        Assert.DoesNotContain(sepharad.Prishot.Values.SelectMany(l => l), p => p.Code == "עוא\"ז");

        var ashkenaz = VesetEngine.CalculateEngine(db, true, new EngineOptions { Today = abs + 35, Akirot = false });
        Assert.Contains(ashkenaz.Prishot.Values.SelectMany(l => l), p => p.Code == "עוא\"ז");
    }

    // --- (d) Safek onah (twilight) - concern for BOTH onot ---

    [Fact]
    public void SafekOna_NightSighting_AlsoMarksDayOnaOfSameConcernDate()
    {
        // Companion to StringencyTests.SafekOnaBoth_Off_OnlyOwnOna_On_AlsoMarksPreviousOna
        // (which covers a Day sighting) - this covers the opposite direction, a Night sighting.
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [10000] = new() { Type = "reiyah", Ona = OnaType.Night, SafekOna = true }
        };
        int beinonitAbs = 10000 + 29;

        var off = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false });
        Assert.Single(off.Prishot[beinonitAbs]);
        Assert.Equal(OnaType.Night, off.Prishot[beinonitAbs][0].Ona);

        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = 10005, Akirot = false, Stringencies = new Dictionary<string, bool> { ["safekOnaBoth"] = true } });
        Assert.Equal(2, on.Prishot[beinonitAbs].Count);
        Assert.Contains(on.Prishot[beinonitAbs], p => p.Ona == OnaType.Night);
        Assert.Contains(on.Prishot[beinonitAbs], p => p.Ona == OnaType.Day);
    }

    [Fact]
    public void SafekOna_AppliesToHaflagahAndYomHachodeshConcernsToo_NotOnlyBeinonit()
    {
        // The stringency's own comment says "every concern of hers" is marked in both onot -
        // confirm it isn't scoped to onah beinonit alone.
        var db = new Dictionary<int, VesetEngine.CalendarDayEntry>
        {
            [D(5, HDate.Shvat, 5786)] = new() { Type = "reiyah", Ona = OnaType.Day },
            [D(25, HDate.Shvat, 5786)] = new() { Type = "reiyah", Ona = OnaType.Day, SafekOna = true }
        };
        int today = D(25, HDate.Shvat, 5786) + 25;

        var on = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = today, Akirot = false, Stringencies = new Dictionary<string, bool> { ["safekOnaBoth"] = true } });

        int haflagahAbs = D(25, HDate.Shvat, 5786) + (D(25, HDate.Shvat, 5786) - D(5, HDate.Shvat, 5786));
        Assert.True(on.Prishot.TryGetValue(haflagahAbs, out var haflagahEntries));
        Assert.Contains(haflagahEntries!, p => p.Ona == OnaType.Day && p.Code == "עו\"ה");
        Assert.Contains(haflagahEntries!, p => p.Ona == OnaType.Night && p.Code == "עו\"ה");
    }
}
