using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

/// <summary>User-configurable Google Calendar sync preferences - matches js/googleCalendar.js's settings shape exactly (docs/GOOGLE_CALENDAR_SPEC.md sec.8).</summary>
public sealed class CalendarSyncSettings
{
    public string Discretion { get; set; } = "subtle"; // "detailed" | "subtle" | "discreet"
    public string DiscreetPrefix { get; set; } = "";
    public bool NotifyEmail { get; set; } = true;
    public bool NotifyPopup { get; set; } = true;
    public string MorningTime { get; set; } = "08:30";
    public int SunsetLeadMinutes { get; set; } = 120;
    public int HefsekAdvisoryDays { get; set; } = 5;
    public bool MochDachukEnabled { get; set; }
}

public sealed class ReminderOverride
{
    public string Method { get; set; } = "";
    public int Minutes { get; set; }
}

public sealed class ExpectedCalendarEvent
{
    public string SyncKey { get; set; } = "";
    public string EventType { get; set; } = "";
    public int DateAbs { get; set; }
    public OnaType? Ona { get; set; }
    public string Summary { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public List<ReminderOverride> Reminders { get; set; } = [];
}

public sealed class ExistingCalendarEvent
{
    public string Id { get; set; } = "";
    public string SyncKey { get; set; } = "";
    public DateTime StartDateTime { get; set; }
    public DateTime EndDateTime { get; set; }
}

public sealed class CalendarReconcileDiff
{
    public List<ExpectedCalendarEvent> ToCreate { get; set; } = [];
    public List<(string Id, ExpectedCalendarEvent Event)> ToUpdate { get; set; } = [];
    public List<string> ToDelete { get; set; } = [];
}

/// <summary>
/// Google Calendar sync, pure logic half - ported from js/googleCalendar.js's
/// buildExpectedEvents/reconcileEvents/hasCalendarScope (docs/GOOGLE_CALENDAR_SPEC.md).
/// Knows nothing about the network - given the app's own already-computed state, it
/// decides what events SHOULD exist and what to do about what already does. The I/O half
/// (GoogleCalendarService, Taharah.Infrastructure.Backup) is a thin layer on top.
/// </summary>
public static class GoogleCalendarManager
{
    public const string CalendarSummary = "לוח טהרה - תזכורות אישיות";

    // computed.prishot can project up to ChazakaHorizonDays (730) for a fixed veset, but
    // creating that many calendar events at once would both hammer the API and clutter the
    // calendar with reminders for a year not yet lived through - a short rolling window,
    // re-synced regularly, keeps the calendar accurate without holding that much state.
    public const int SyncHorizonDays = 60;

    private const double TzeitAngle = 8.5;

    private static string BuildSummary(string eventType, object? ctx, CalendarSyncSettings settings, int index)
    {
        if (settings.Discretion == "discreet")
        {
            string prefix = string.IsNullOrEmpty(settings.DiscreetPrefix) ? "תזכורת" : settings.DiscreetPrefix;
            return $"{prefix} {index + 1}";
        }
        bool detailed = settings.Discretion == "detailed";
        return eventType switch
        {
            "check_morning" => detailed ? $"בדיקת שחרית - יום {ctx} לשבעה נקיים" : "בדיקה - בוקר",
            "check_afternoon" => detailed ? $"בדיקת מנחה - יום {ctx} לשבעה נקיים" : "בדיקה - מנחה",
            "tevilah" => detailed ? "טבילה (ליל מקווה)" : "טבילה",
            "tevilah_headsup" => detailed ? "תזכורת בוקר - טבילה הערב" : "תזכורת",
            "prisha_day" => detailed ? $"עונת פרישה (יום) - {ctx}" : "עונת פרישה (יום)",
            "prisha_night" => detailed ? $"עונת פרישה (לילה) - {ctx}" : "עונת פרישה (לילה)",
            "prisha_day_headsup" => detailed ? $"תזכורת ערב - עונת פרישה מחר (יום) - {ctx}" : "תזכורת",
            "prisha_night_headsup" => detailed ? $"תזכורת בוקר - עונת פרישה הערב (לילה) - {ctx}" : "תזכורת",
            "hefsek_advisory" => detailed ? "הפסק טהרה - כדאי לבדוק" : "תזכורת בדיקה",
            "moch" => detailed ? "מוך דחוק" : "תזכורת בדיקה",
            _ => eventType
        };
    }

    private static List<ReminderOverride> RemindersFor(List<ReminderOverride> overrides, CalendarSyncSettings settings)
    {
        var list = new List<ReminderOverride>();
        foreach (var o in overrides)
        {
            if (o.Method == "email" && !settings.NotifyEmail) continue;
            if (o.Method == "popup" && !settings.NotifyPopup) continue;
            list.Add(o);
        }
        return list;
    }

    private static TimeZoneInfo LocationTz(LocationDef location)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(location.Tzid); }
        catch { return TimeZoneInfo.Local; }
    }

    /// <summary>"HH:MM" wall-clock time on the Gregorian day of `abs`, in the location's own timezone.</summary>
    private static DateTime? ClockTimeFor(int abs, string hhmm, LocationDef? location)
    {
        if (location == null) return null;
        var parts = hhmm.Split(':');
        if (parts.Length != 2 || !int.TryParse(parts[0], out int h) || !int.TryParse(parts[1], out int m)) return null;
        var greg = ZmanimManager.GregorianFromAbs(abs);
        var local = new DateTime(greg.Year, greg.Month, greg.Day, h, m, 0, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, LocationTz(location));
    }

    /// <summary>"HH:MM" wall-clock time on the SAME civil day (in the location's timezone) as `refUtc` already falls on.</summary>
    private static DateTime? ClockTimeOnSameDayAs(DateTime refUtc, string hhmm, LocationDef? location)
    {
        if (location == null) return null;
        var parts = hhmm.Split(':');
        if (parts.Length != 2 || !int.TryParse(parts[0], out int h) || !int.TryParse(parts[1], out int m)) return null;
        var tz = LocationTz(location);
        var refLocal = TimeZoneInfo.ConvertTimeFromUtc(refUtc, tz);
        var local = new DateTime(refLocal.Year, refLocal.Month, refLocal.Day, h, m, 0, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(local, tz);
    }

    /// <summary>
    /// The advisory day for the hefsek suggestion: the most recent recorded reiyah with no
    /// hefsek recorded on or after it, once `advisoryDays` have passed since it - or null if
    /// there is nothing to suggest. Only ever returns `todayAbs` itself (never projected into
    /// the future), since whether it still applies depends on what gets recorded meanwhile.
    /// </summary>
    private static int? FindHefsekAdvisoryDay(Dictionary<int, VesetEngine.CalendarDayEntry> db, int todayAbs, int advisoryDays)
    {
        int? lastBleedingStart = null;
        bool hefsekSince = false;
        foreach (var abs in db.Keys.OrderBy(x => x))
        {
            if (abs > todayAbs) continue;
            var entry = db[abs];
            if (entry.Type == "reiyah")
            {
                lastBleedingStart = abs;
                hefsekSince = false;
            }
            else if (entry.Type == "hefsek")
            {
                hefsekSince = true;
            }
        }
        if (!lastBleedingStart.HasValue || hefsekSince) return null;
        if (todayAbs - lastBleedingStart.Value < advisoryDays) return null;
        return todayAbs;
    }

    /// <summary>
    /// Derives the full list of events that SHOULD exist in the app's calendar for the next
    /// SyncHorizonDays, from the app's own already-computed state - never by re-deriving
    /// halacha itself (that stays VesetEngine's job). Pure and synchronous: no network.
    /// </summary>
    public static List<ExpectedCalendarEvent> BuildExpectedEvents(
        Dictionary<int, VesetEngine.CalendarDayEntry> db,
        EngineResult engineResult,
        LocationDef? location,
        int todayAbs,
        CalendarSyncSettings settings)
    {
        var events = new List<ExpectedCalendarEvent>();
        if (location == null) return events; // no location - no sunrise/sunset, nothing to schedule
        int horizonEnd = todayAbs + SyncHorizonDays;
        int index = 0;

        void Push(string eventType, object? ctx, int dateAbs, OnaType? ona, DateTime? start, DateTime? end,
            List<ReminderOverride> reminderOverrides, string description)
        {
            if (!start.HasValue || !end.HasValue) return; // no sunrise/sunset that day (extreme latitude) - skip, never guess
            events.Add(new ExpectedCalendarEvent
            {
                SyncKey = $"{eventType}_{dateAbs}_{(ona.HasValue ? (ona.Value == OnaType.Day ? "day" : "night") : "x")}",
                EventType = eventType,
                DateAbs = dateAbs,
                Ona = ona,
                Summary = BuildSummary(eventType, ctx, settings, index++),
                Description = description,
                Start = start.Value,
                End = end.Value,
                Reminders = RemindersFor(reminderOverrides, settings)
            });
        }

        // A short (5-minute) separate calendar event whose only purpose is to carry an email
        // reminder at a genuine FIXED clock time - Google Calendar reminders can only ever be
        // "N minutes before THIS event's start", so a main event anchored to sunset/tzeit
        // (which drifts through the year) cannot carry a fixed-clock-time email any other way.
        // Skipped entirely when email notifications are off - its only job is that one reminder.
        void PushHeadsUp(string eventType, object? ctx, int dateAbs, DateTime? anchor, string hhmm, string description)
        {
            if (!settings.NotifyEmail || !anchor.HasValue) return;
            var start = ClockTimeOnSameDayAs(anchor.Value, hhmm, location);
            if (!start.HasValue) return;
            Push(eventType, ctx, dateAbs, null, start, start.Value.AddMinutes(5),
                [new ReminderOverride { Method = "email", Minutes = 0 }], description);
        }

        // --- שבעה נקיים: בדיקת שחרית ומנחה, ימים 1-7 (engineResult.Nekiim) ---
        foreach (var abs in engineResult.Nekiim)
        {
            if (abs < todayAbs || abs > horizonEnd) continue;
            int? dayNum = null;
            for (int d = 1; d <= 7; d++)
            {
                if (db.TryGetValue(abs - d, out var prevEntry) && prevEntry.Type == "hefsek") { dayNum = d; break; }
            }
            var raw = ZmanimManager.DayTimesRaw(abs, location);
            if (raw == null) continue;

            var morning = ClockTimeFor(abs, settings.MorningTime, location);
            Push("check_morning", dayNum, abs, OnaType.Day, morning, morning?.AddMinutes(30),
                [new ReminderOverride { Method = "email", Minutes = 0 }, new ReminderOverride { Method = "popup", Minutes = 0 }],
                "תזכורת בדיקת שבעה נקיים\nהופק ע\"י לוח טהרה");

            var afternoonStart = raw.Day.Sunset.AddMinutes(-60);
            Push("check_afternoon", dayNum, abs, OnaType.Day, afternoonStart, raw.Day.Sunset,
                [new ReminderOverride { Method = "email", Minutes = settings.SunsetLeadMinutes }, new ReminderOverride { Method = "popup", Minutes = 45 }],
                "תזכורת בדיקת שבעה נקיים\nהופק ע\"י לוח טהרה");
        }

        // --- טבילה (ליל מקווה): engineResult.Tevilot - צאת הכוכבים ומשך שעתיים ---
        foreach (var abs in engineResult.Tevilot)
        {
            if (abs < todayAbs || abs > horizonEnd) continue;
            var tzeit = ZmanimManager.Tzeit(abs, location, TzeitAngle);
            if (tzeit == null) continue;
            Push("tevilah", null, abs, OnaType.Night, tzeit, tzeit.Value.AddMinutes(120),
                [new ReminderOverride { Method = "popup", Minutes = 60 }],
                "תזכורת טבילה\nהופק ע\"י לוח טהרה");
            PushHeadsUp("tevilah_headsup", null, abs, tzeit, settings.MorningTime,
                "תזכורת בוקר לקראת הטבילה הערב\nהופק ע\"י לוח טהרה");
        }

        // --- עונות פרישה: engineResult.Prishot, מסוננות לימים העתידיים בטווח בלבד ---
        foreach (var abs in engineResult.Prishot.Keys.OrderBy(x => x))
        {
            if (abs < todayAbs || abs > horizonEnd) continue;
            var raw = ZmanimManager.DayTimesRaw(abs, location);
            if (raw == null) continue;

            foreach (var p in engineResult.Prishot[abs])
            {
                // An uprooted concern stays in Prishot (marked, not removed) so the calendar
                // GRID can still show that something once stood there. A calendar EVENT must
                // never be created for it - the concern no longer applies.
                if (p.Uprooted) continue;

                if (p.Ona == OnaType.Day)
                {
                    Push("prisha_day", p.Code, abs, OnaType.Day, raw.Day.Sunrise, raw.Day.Sunset,
                        [new ReminderOverride { Method = "popup", Minutes = 0 }],
                        $"עונת פרישה - {p.Reason}\nהופק ע\"י לוח טהרה");
                    PushHeadsUp("prisha_day_headsup", p.Code, abs, raw.Day.Sunrise.AddDays(-1), "20:00",
                        $"תזכורת ערב לקראת עונת פרישה מחר (יום) - {p.Reason}\nהופק ע\"י לוח טהרה");
                }
                else
                {
                    Push("prisha_night", p.Code, abs, OnaType.Night, raw.Night.Sunset, raw.Night.Sunrise,
                        [new ReminderOverride { Method = "popup", Minutes = 30 }],
                        $"עונת פרישה - {p.Reason}\nהופק ע\"י לוח טהרה");
                    PushHeadsUp("prisha_night_headsup", p.Code, abs, raw.Night.Sunset, settings.MorningTime,
                        $"תזכורת בוקר לקראת עונת פרישה הערב (לילה) - {p.Reason}\nהופק ע\"י לוח טהרה");
                }
            }
        }

        // --- הפסק טהרה / מוך דחוק: הצעה בלבד, לא הכרעה הלכתית ---
        var hefsekAdvisoryAbs = FindHefsekAdvisoryDay(db, todayAbs, settings.HefsekAdvisoryDays);
        if (hefsekAdvisoryAbs == todayAbs)
        {
            var raw = ZmanimManager.DayTimesRaw(todayAbs, location);
            if (raw != null)
            {
                Push("hefsek_advisory", null, todayAbs, OnaType.Day, raw.Day.Sunset.AddMinutes(-60), raw.Day.Sunset,
                    [new ReminderOverride { Method = "email", Minutes = settings.SunsetLeadMinutes }, new ReminderOverride { Method = "popup", Minutes = 45 }],
                    "לא נרשם הפסק טהרה עדיין - כדאי לבדוק אם הגיע הזמן (הצעה בלבד, לא הוראה הלכתית)\nהופק ע\"י לוח טהרה");

                if (settings.MochDachukEnabled)
                {
                    var tzeit = ZmanimManager.Tzeit(todayAbs, location, TzeitAngle);
                    if (tzeit != null)
                    {
                        Push("moch", null, todayAbs, OnaType.Day, raw.Day.Sunset.AddMinutes(-15), tzeit,
                            [new ReminderOverride { Method = "popup", Minutes = 0 }],
                            "תזכורת מוך דחוק\nהופק ע\"י לוח טהרה");
                    }
                }
            }
        }

        return events;
    }

    /// <summary>
    /// Decides what must be created, updated or deleted so the calendar matches `expected`
    /// exactly. Matching is by SyncKey alone - never re-derived from a title or raw date,
    /// since discretion levels can make two different events look identical.
    /// </summary>
    public static CalendarReconcileDiff ReconcileEvents(List<ExpectedCalendarEvent> expected, List<ExistingCalendarEvent> existing)
    {
        var byKey = existing.ToDictionary(e => e.SyncKey, e => e);
        var expectedKeys = new HashSet<string>(expected.Select(e => e.SyncKey));

        var diff = new CalendarReconcileDiff();
        foreach (var exp in expected)
        {
            if (!byKey.TryGetValue(exp.SyncKey, out var found))
            {
                diff.ToCreate.Add(exp);
                continue;
            }
            if (found.StartDateTime != exp.Start || found.EndDateTime != exp.End)
            {
                diff.ToUpdate.Add((found.Id, exp));
            }
        }

        diff.ToDelete = existing.Where(e => !expectedKeys.Contains(e.SyncKey)).Select(e => e.Id).ToList();
        return diff;
    }

    /// <summary>Whether the connected Google account has actually consented to the calendar scope (an existing Sheets-only connection made before this feature shipped would not have).</summary>
    public static bool HasCalendarScope(string? grantedScopes)
    {
        return !string.IsNullOrEmpty(grantedScopes) && grantedScopes.Contains("/auth/calendar");
    }
}

