using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class GoogleCalendarManagerTests
{
    private static readonly LocationDef Jerusalem = ZmanimManager.LocationById("jerusalem")!;

    private static CalendarSyncSettings BaseSettings() => new()
    {
        Discretion = "subtle",
        DiscreetPrefix = "",
        NotifyEmail = true,
        NotifyPopup = true,
        MorningTime = "08:30",
        SunsetLeadMinutes = 120,
        HefsekAdvisoryDays = 5,
        MochDachukEnabled = false
    };

    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    // ---------- 1. nekiim + tevilah, from a recorded hefsek ----------

    [Fact]
    public void Nekiim_And_Tevilah_ProduceExpectedEventCounts()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = hefsekAbs });

        var events = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, BaseSettings());

        Assert.Equal(7, events.Count(e => e.EventType == "check_morning"));
        Assert.Equal(7, events.Count(e => e.EventType == "check_afternoon"));
        Assert.Single(events, e => e.EventType == "tevilah");
        Assert.Equal(events.Count, events.Select(e => e.SyncKey).Distinct().Count());
        Assert.All(events, e => Assert.True(e.End > e.Start));
    }

    // ---------- 2. discretion levels ----------

    [Fact]
    public void DiscretionLevels_ControlEventNaming()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = hefsekAbs });

        var detailedSettings = BaseSettings();
        detailedSettings.Discretion = "detailed";
        var detailed = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, detailedSettings)
            .First(e => e.EventType == "check_morning");
        Assert.Contains("שחרית", detailed.Summary);
        Assert.Contains("לשבעה נקיים", detailed.Summary);

        var subtleEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, BaseSettings());
        var subtle = subtleEvents.First(e => e.EventType == "check_morning");
        Assert.Equal("בדיקה - בוקר", subtle.Summary);

        var discreetSettings = BaseSettings();
        discreetSettings.Discretion = "discreet";
        var discreetEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, discreetSettings);
        Assert.All(discreetEvents, e => Assert.Matches(@"^תזכורת \d+$", e.Summary));
        Assert.Equal(discreetEvents.Count, discreetEvents.Select(e => e.Summary).Distinct().Count());

        var customPrefixSettings = BaseSettings();
        customPrefixSettings.Discretion = "discreet";
        customPrefixSettings.DiscreetPrefix = "פגישה";
        var customPrefixEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, customPrefixSettings);
        Assert.StartsWith("פגישה", customPrefixEvents[0].Summary);
    }

    // ---------- 3. reminder channel filtering ----------

    [Fact]
    public void ReminderChannels_AreFilteredBySettings()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = hefsekAbs });

        var baseEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, BaseSettings());
        var morning = baseEvents.First(e => e.EventType == "check_morning");
        Assert.Contains(morning.Reminders, r => r.Method == "email");
        Assert.Contains(morning.Reminders, r => r.Method == "popup");

        var emailOnly = BaseSettings();
        emailOnly.NotifyPopup = false;
        var emailOnlyEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, emailOnly);
        Assert.All(emailOnlyEvents, e => Assert.DoesNotContain(e.Reminders, r => r.Method == "popup"));
        Assert.Contains(emailOnlyEvents, e => e.Reminders.Any(r => r.Method == "email"));

        var none = BaseSettings();
        none.NotifyEmail = false;
        none.NotifyPopup = false;
        var noneEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, none);
        Assert.All(noneEvents, e => Assert.Empty(e.Reminders));
    }

    // ---------- 3b. sunset-lead email time (settings.SunsetLeadMinutes) ----------

    [Fact]
    public void SunsetLeadMinutes_ControlsAfternoonEmailReminder_PopupFixedAt45()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = hefsekAbs });

        var baseEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, BaseSettings());
        var afternoon = baseEvents.First(e => e.EventType == "check_afternoon");
        Assert.Equal(120, afternoon.Reminders.First(r => r.Method == "email").Minutes);

        var shortLead = BaseSettings();
        shortLead.SunsetLeadMinutes = 30;
        var shortLeadEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, shortLead);
        var shortLeadAfternoon = shortLeadEvents.First(e => e.EventType == "check_afternoon");
        Assert.Equal(30, shortLeadAfternoon.Reminders.First(r => r.Method == "email").Minutes);
        Assert.Equal(45, shortLeadAfternoon.Reminders.First(r => r.Method == "popup").Minutes);
    }

    [Fact]
    public void HefsekAdvisory_OnlyFiresToday_AndHonorsSunsetLeadMinutes()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        int advisoryToday = hefsekAbs - 10;
        var advisoryDb = Db();
        advisoryDb[advisoryToday - 6] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        var advisoryEngine = VesetEngine.CalculateEngine(advisoryDb, false, new EngineOptions { Today = advisoryToday });

        var settings = BaseSettings();
        settings.SunsetLeadMinutes = 60;
        var events = GoogleCalendarManager.BuildExpectedEvents(advisoryDb, advisoryEngine, Jerusalem, advisoryToday, settings);
        var advisory = events.FirstOrDefault(e => e.EventType == "hefsek_advisory");

        Assert.NotNull(advisory);
        Assert.Equal(60, advisory!.Reminders.First(r => r.Method == "email").Minutes);
    }

    // ---------- 3c. fixed-clock-time heads-up events ----------

    [Fact]
    public void TevilahHeadsUp_CarriesTheEmailReminder_MainEventKeepsOnlyPopup()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = hefsekAbs });
        var events = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, BaseSettings());

        var tevilah = events.First(e => e.EventType == "tevilah");
        var headsUp = events.FirstOrDefault(e => e.EventType == "tevilah_headsup");

        Assert.DoesNotContain(tevilah.Reminders, r => r.Method == "email");
        Assert.Contains(tevilah.Reminders, r => r.Method == "popup" && r.Minutes == 60);
        Assert.NotNull(headsUp);
        Assert.Equal(tevilah.DateAbs, headsUp!.DateAbs);
        Assert.Single(headsUp.Reminders);
        Assert.Equal("email", headsUp.Reminders[0].Method);

        var noEmail = BaseSettings();
        noEmail.NotifyEmail = false;
        var noEmailEvents = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, hefsekAbs, noEmail);
        Assert.DoesNotContain(noEmailEvents, e => e.EventType == "tevilah_headsup");
        Assert.Contains(noEmailEvents, e => e.EventType == "tevilah");
    }

    // ---------- 4. sync horizon window ----------

    [Fact]
    public void SyncHorizon_ExcludesEventsOutsideTheWindow()
    {
        int todayAbs = new HDate(1, 1, 5786).Abs();
        var db = Db();
        db[todayAbs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = todayAbs });

        var events = GoogleCalendarManager.BuildExpectedEvents(db, engine, Jerusalem, todayAbs, BaseSettings());

        Assert.All(events, e => Assert.True(e.DateAbs <= todayAbs + GoogleCalendarManager.SyncHorizonDays));
        Assert.All(events, e => Assert.True(e.DateAbs >= todayAbs));
    }

    // ---------- 5. an uprooted concern never becomes a calendar event ----------

    [Fact]
    public void UprootedConcern_LiveVsUprooted_NeverBecomesAnEvent()
    {
        int singleSightingAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[singleSightingAbs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };

        // Control case: while the concern is still live (the due day itself), it DOES produce an event.
        var liveEngine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = singleSightingAbs + 29 });
        var liveEvents = GoogleCalendarManager.BuildExpectedEvents(db, liveEngine, Jerusalem, singleSightingAbs + 29, BaseSettings());
        Assert.Contains(liveEvents, e => e.EventType == "prisha_day" || e.EventType == "prisha_night");

        // Advance far past it with no sighting recorded there - the concern becomes uprooted.
        int farAbs = new HDate(20, 2, 5786).Abs();
        var uprootedEngine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = farAbs });
        var uprootedAbsDays = uprootedEngine.Prishot
            .Where(kv => kv.Value.Any(p => p.Uprooted))
            .Select(kv => kv.Key)
            .ToList();
        Assert.NotEmpty(uprootedAbsDays); // setup check

        var uprootedEvents = GoogleCalendarManager.BuildExpectedEvents(db, uprootedEngine, Jerusalem, farAbs, BaseSettings());
        Assert.DoesNotContain(uprootedEvents, e => uprootedAbsDays.Contains(e.DateAbs) &&
            (e.EventType == "prisha_day" || e.EventType == "prisha_night"));
        Assert.DoesNotContain(uprootedEvents, e => uprootedAbsDays.Contains(e.DateAbs) &&
            (e.EventType == "prisha_day_headsup" || e.EventType == "prisha_night_headsup"));
    }

    // ---------- 6. reconcile: create / update / delete ----------

    [Fact]
    public void ReconcileEvents_CreatesUpdatesAndDeletesCorrectly()
    {
        var t1 = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc);
        var t1End = new DateTime(2026, 1, 1, 11, 0, 0, DateTimeKind.Utc);
        var t2 = new DateTime(2026, 1, 2, 10, 0, 0, DateTimeKind.Utc);
        var t2End = new DateTime(2026, 1, 2, 11, 0, 0, DateTimeKind.Utc);
        var t3 = new DateTime(2026, 1, 3, 9, 0, 0, DateTimeKind.Utc);
        var t3End = new DateTime(2026, 1, 3, 10, 0, 0, DateTimeKind.Utc);
        var t3ExistingStart = new DateTime(2026, 1, 3, 10, 0, 0, DateTimeKind.Utc);
        var t3ExistingEnd = new DateTime(2026, 1, 3, 11, 0, 0, DateTimeKind.Utc);
        var t4 = new DateTime(2026, 1, 4, 10, 0, 0, DateTimeKind.Utc);
        var t4End = new DateTime(2026, 1, 4, 11, 0, 0, DateTimeKind.Utc);

        var expected = new List<ExpectedCalendarEvent>
        {
            new() { SyncKey = "a", Start = t1, End = t1End },
            new() { SyncKey = "b", Start = t2, End = t2End },
            new() { SyncKey = "c", Start = t3, End = t3End }
        };
        var existing = new List<ExistingCalendarEvent>
        {
            new() { Id = "g1", SyncKey = "a", StartDateTime = t1, EndDateTime = t1End }, // unchanged
            new() { Id = "g2", SyncKey = "c", StartDateTime = t3ExistingStart, EndDateTime = t3ExistingEnd }, // time changed -> update
            new() { Id = "g3", SyncKey = "d", StartDateTime = t4, EndDateTime = t4End } // no longer expected -> delete
        };

        var diff = GoogleCalendarManager.ReconcileEvents(expected, existing);

        Assert.Single(diff.ToCreate);
        Assert.Equal("b", diff.ToCreate[0].SyncKey);
        Assert.Single(diff.ToUpdate);
        Assert.Equal("g2", diff.ToUpdate[0].Id);
        Assert.Single(diff.ToDelete);
        Assert.Equal("g3", diff.ToDelete[0]);
        Assert.DoesNotContain(diff.ToCreate, e => e.SyncKey == "a");
        Assert.DoesNotContain(diff.ToUpdate, u => u.Event.SyncKey == "a");
    }

    // ---------- 7. hasCalendarScope ----------

    [Fact]
    public void HasCalendarScope_RecognizesTheCalendarScope()
    {
        Assert.True(GoogleCalendarManager.HasCalendarScope(
            "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar"));
        Assert.False(GoogleCalendarManager.HasCalendarScope("https://www.googleapis.com/auth/drive.file"));
        Assert.False(GoogleCalendarManager.HasCalendarScope(""));
        Assert.False(GoogleCalendarManager.HasCalendarScope(null));
    }
}

