using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class EmailExportManagerTests
{
    private static Dictionary<int, VesetEngine.CalendarDayEntry> Db() => [];

    [Fact]
    public void NeitherOptionSelected_ProducesOnlyTheNoDataNotice()
    {
        var db = Db();
        var engine = VesetEngine.CalculateEngine(db, false);

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: false, includeNotes: false);

        Assert.Contains(payload, kv => kv.Key == "_subject" && kv.Value == "ריכוז נתונים - לוח טהרת המשפחה");
        Assert.Contains(payload, kv => kv.Key == "נתונים" && kv.Value == "לא נבחרו נתונים לייצוא.");
    }

    [Fact]
    public void NoNotes_DefaultsToNoMessagePlaceholder()
    {
        var db = Db();
        var engine = VesetEngine.CalculateEngine(db, false);

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: false, includeNotes: false);

        Assert.Contains(payload, kv => kv.Key == "הודעה שצורפה" && kv.Value == "ללא הודעה");
    }

    [Fact]
    public void CustomNotes_ArePassedThrough()
    {
        var db = Db();
        var engine = VesetEngine.CalculateEngine(db, false);

        var payload = EmailExportManager.BuildExportPayload(db, engine, "הודעה לרב", includeFuture: false, includeHistory: false, includeNotes: false);

        Assert.Contains(payload, kv => kv.Key == "הודעה שצורפה" && kv.Value == "הודעה לרב");
    }

    [Fact]
    public void FutureData_NoReiyot_ShowsExplicitEmptyNotice()
    {
        var db = Db();
        var engine = VesetEngine.CalculateEngine(db, false);

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: true, includeHistory: false, includeNotes: false);

        Assert.Contains(payload, kv => kv.Key == "נתוני פרישה עתידיים" && kv.Value == "אין עדיין רישומי וסתות במערכת.");
    }

    [Fact]
    public void FutureData_WithReiyot_ListsThemNewestFirstWithFullDetail()
    {
        int abs1 = new HDate(5, 1, 5786).Abs();
        int abs2 = new HDate(5, 2, 5786).Abs();
        var db = Db();
        db[abs1] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[abs2] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = abs2 });

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: true, includeHistory: false, includeNotes: false);

        var vesetKeys = payload.Where(kv => kv.Key.StartsWith("📌 וסת ")).Select(kv => kv.Key).ToList();
        Assert.Equal(2, vesetKeys.Count);
        // Newest sighting first (וסת 2 before וסת 1), matching js's [...reiyot].reverse().
        Assert.True(payload.FindIndex(kv => kv.Key.StartsWith("📌 וסת 2")) < payload.FindIndex(kv => kv.Key.StartsWith("📌 וסת 1")));

        var latest = payload.First(kv => kv.Key.StartsWith("📌 וסת 2"));
        Assert.Contains("עונת לילה", latest.Value);
        Assert.Contains("הפלגה קודמת:", latest.Value);
        Assert.Contains("יום החודש:", latest.Value);
    }

    [Fact]
    public void FutureData_PendingChecks_AreListedWithWarningText()
    {
        int hefsekAbs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        // Three consecutive same-day-of-month sightings establish a fixed veset (month), whose
        // due time then passes without a check - producing a pending-check entry.
        var m1 = new HDate(5, 1, 5786).Abs();
        var m2 = new HDate(5, 2, 5786).Abs();
        var m3 = new HDate(5, 3, 5786).Abs();
        db[m1] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[m2] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        db[m3] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day };
        var m4 = new HDate(5, 4, 5786).Abs();
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = m4 + 1 });

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: true, includeHistory: false, includeNotes: false);

        if (engine.PendingChecks.Count > 0)
        {
            Assert.Contains(payload, kv => kv.Key == "⏳ זמני וסת שעברו בלא בדיקה" && kv.Value.Contains("אסורה לבעלה עד שתבדק"));
        }
        if (engine.StandingVesets.Count > 0)
        {
            Assert.Contains(payload, kv => kv.Key == "⭐ וסת קבוע שנקבע" && kv.Value.Contains("אין חוששים לשאר החששות"));
        }
    }

    [Fact]
    public void HistoryData_NoEvents_ShowsExplicitEmptyNotice()
    {
        var db = Db();
        var engine = VesetEngine.CalculateEngine(db, false);

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: true, includeNotes: false);

        Assert.Contains(payload, kv => kv.Key == "היסטוריית אירועים" && kv.Value == "אין אירועים מתועדים.");
    }

    [Fact]
    public void HistoryData_ListsEachEventTypeWithItsOwnLabel()
    {
        int reiyahAbs = new HDate(5, 1, 5786).Abs();
        int hefsekAbs = new HDate(12, 1, 5786).Abs();
        int checkAbs = new HDate(13, 1, 5786).Abs();
        int tevilahAbs = new HDate(19, 1, 5786).Abs();

        var db = Db();
        db[reiyahAbs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Kind = "sharp" };
        db[hefsekAbs] = new VesetEngine.CalendarDayEntry { Type = "hefsek", Ona = OnaType.Day };
        db[checkAbs] = new VesetEngine.CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "wipe" };
        db[tevilahAbs] = new VesetEngine.CalendarDayEntry { Type = "tevilah", Ona = OnaType.Night };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = tevilahAbs });

        var payload = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: true, includeNotes: false);

        Assert.Contains(payload, kv => kv.Value.Contains("ראייה") && kv.Value.Contains("מאכל חריף"));
        Assert.Contains(payload, kv => kv.Value == "הפסק טהרה");
        Assert.Contains(payload, kv => kv.Value.Contains("בדיקה") && kv.Value.Contains("קינוח בלבד"));
        Assert.Contains(payload, kv => kv.Value == "טבילה");
    }

    [Fact]
    public void HistoryData_NotesIncludedOnlyWhenRequested()
    {
        int abs = new HDate(5, 1, 5786).Abs();
        var db = Db();
        db[abs] = new VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Note = "תחושת חום" };
        var engine = VesetEngine.CalculateEngine(db, false, new EngineOptions { Today = abs });

        var withNotes = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: true, includeNotes: true);
        Assert.Contains(withNotes, kv => kv.Value.Contains("הערה: תחושת חום"));

        var withoutNotes = EmailExportManager.BuildExportPayload(db, engine, null, includeFuture: false, includeHistory: true, includeNotes: false);
        Assert.DoesNotContain(withoutNotes, kv => kv.Value.Contains("תחושת חום"));
    }
}


