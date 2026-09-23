using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Infrastructure.Backup;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class GoogleBackupTests
{
    [Fact]
    public void Scenario1_BuildPayload_SequentialAndMetaRow()
    {
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [10000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Note = "יום ראשון" },
            [10005] = new CalendarDayEntry { Type = "hefsek", Note = "" },
            [10012] = new CalendarDayEntry { Type = "tevilah" },
            [10020] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night }
        };

        var rows = GoogleBackupManager.BuildPayload(db, "123456", "user@example.com");

        Assert.Equal(5, rows.Count);
        Assert.Equal("1", rows[0][0]);
        Assert.Equal("4", rows[3][0]);
        Assert.Equal("ראייה", rows[0][4]);
        Assert.Equal("יום", rows[0][5]);
        Assert.Equal("הפסק טהרה", rows[1][4]);
        Assert.Equal("—", rows[1][5]);
        Assert.Equal("טבילה", rows[2][4]);
        Assert.Equal("לילה", rows[3][5]);
        Assert.Equal(new HDate(10000).RenderGematriya(), rows[0][1]);
        Assert.Equal("10000", rows[0][3]);
        Assert.Equal("יום ראשון", rows[0][6]);

        var metaRow = rows[4];
        Assert.Equal("123456", metaRow[7]);
        Assert.Equal("user@example.com", metaRow[8]);
    }

    [Fact]
    public void Scenario2_EmptyDb_ProducesMetaRowOnly()
    {
        var emptyRows = GoogleBackupManager.BuildPayload([], "654321", "");
        Assert.Single(emptyRows);
        Assert.Equal("654321", emptyRows[0][7]);
        Assert.Equal("—", emptyRows[0][8]);

        var emptyParsed = GoogleBackupManager.ParseBackupRows(emptyRows);
        Assert.Equal("654321", emptyParsed.Pin);
        Assert.Equal("", emptyParsed.RecoveryEmail);
    }

    [Fact]
    public void Scenario3_RestoreParsing_RoundTrip()
    {
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [10000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Note = "יום ראשון" },
            [10005] = new CalendarDayEntry { Type = "hefsek", Note = "" },
            [10012] = new CalendarDayEntry { Type = "tevilah" },
            [10020] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night }
        };

        var rows = GoogleBackupManager.BuildPayload(db, "123456", "user@example.com");
        var parsed = GoogleBackupManager.ParseBackupRows(rows);

        Assert.Equal(4, parsed.Db.Count);
        Assert.Equal("reiyah", parsed.Db[10000].Type);
        Assert.Equal(OnaType.Day, parsed.Db[10000].Ona);
        Assert.Equal("hefsek", parsed.Db[10005].Type);
        Assert.Equal("tevilah", parsed.Db[10012].Type);
        Assert.Equal(OnaType.Night, parsed.Db[10020].Ona);
        Assert.Equal("יום ראשון", parsed.Db[10000].Note);
        Assert.Equal("123456", parsed.Pin);
        Assert.Equal("user@example.com", parsed.RecoveryEmail);
    }

    [Fact]
    public void Scenario4_Restore_IgnoresUnknownGarbageRows_KeepsMeta()
    {
        List<List<string>> weird =
        [
            ["", "", "", "", "מטא-נתונים", "", "", "111222", "a@b.c"],
            ["2", "x", "y", "not-a-number", "ראייה", "יום", "", "", ""],
            ["3", "x", "y", "10050", "סוג לא מוכר", "", "", "", ""],
            ["4", "x", "y", "10060", "ראייה", "יום", "", "", ""]
        ];

        var parsed = GoogleBackupManager.ParseBackupRows(weird);
        Assert.Single(parsed.Db);
        Assert.True(parsed.Db.ContainsKey(10060));
        Assert.Equal("111222", parsed.Pin);
        Assert.Equal("a@b.c", parsed.RecoveryEmail);
    }

    [Fact]
    public void Scenario5_MergeDb_NeverDeletesLocalData()
    {
        var localDb = new Dictionary<int, CalendarDayEntry>
        {
            [10000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day },
            [10005] = new CalendarDayEntry { Type = "hefsek" }
        };
        var remoteDb = new Dictionary<int, CalendarDayEntry>
        {
            [10000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night },
            [10012] = new CalendarDayEntry { Type = "tevilah" },
            [10020] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day }
        };

        var merged = GoogleBackupManager.MergeDb(localDb, remoteDb);
        Assert.Equal(4, merged.Db.Count);
        Assert.Equal("hefsek", merged.Db[10005].Type);
        Assert.Equal("tevilah", merged.Db[10012].Type);
        Assert.Equal(OnaType.Day, merged.Db[10000].Ona); // Local wins!
        Assert.Equal(2, merged.AddedKeys.Count);
        Assert.Contains("10012", merged.AddedKeys);
        Assert.Single(merged.LocalOnlyKeys);
        Assert.Equal("10005", merged.LocalOnlyKeys[0]);
    }

    [Fact]
    public void Scenario6_Merge_EmptyInputs()
    {
        var emptyMerge = GoogleBackupManager.MergeDb([], []);
        Assert.Empty(emptyMerge.Db);
        Assert.Empty(emptyMerge.AddedKeys);

        var remoteDb = new Dictionary<int, CalendarDayEntry>
        {
            [1] = new CalendarDayEntry(),
            [2] = new CalendarDayEntry(),
            [3] = new CalendarDayEntry()
        };
        var nullSafe = GoogleBackupManager.MergeDb(null, remoteDb);
        Assert.Equal(3, nullSafe.Db.Count);
    }

    [Fact]
    public void Scenario8_DiffDb_DetectsAddEditDelete()
    {
        var logBefore = new Dictionary<int, CalendarDayEntry>
        {
            [100] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Note = "" },
            [200] = new CalendarDayEntry { Type = "hefsek", Note = "" }
        };
        var logAfter = new Dictionary<int, CalendarDayEntry>
        {
            [100] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Note = "" }, // unchanged
            [300] = new CalendarDayEntry { Type = "tevilah", Note = "" }, // added
            [200] = new CalendarDayEntry { Type = "hefsek", Note = "עודכן" } // updated
        };

        var changes = GoogleBackupManager.DiffDb(logBefore, logAfter);
        Assert.Equal(2, changes.Count);
        Assert.Contains(changes, c => c.Abs == 300 && c.Action == "נוסף");
        Assert.Contains(changes, c => c.Abs == 200 && c.Action == "עודכן");
        Assert.DoesNotContain(changes, c => c.Abs == 100);

        var delChanges = GoogleBackupManager.DiffDb(logBefore, []);
        Assert.Equal("נמחק", delChanges[0].Action);

        var initChanges = GoogleBackupManager.DiffDb([], logBefore);
        Assert.Equal(2, initChanges.Count);
    }

    [Fact]
    public void Scenario9_ParseHistoryRows_Defensive()
    {
        string ts1 = "2026-09-01T10:00:00.000Z";
        string ts2 = "2026-09-10T10:00:00.000Z";
        List<List<string>> historyRows =
        [
            ["חותמת זמן", "מזהה", "תאריך עברי", "תאריך לועזי", "סוג אירוע", "עונה", "הערה", "פעולה"],
            [ts1, "100", "א טבת", "01/01/2026", "ראייה", "יום", "הערה", "נוסף"],
            [ts1, "200", "ב טבת", "02/01/2026", "טבילה", "—", "", "נוסף"],
            [ts2, "100", "א טבת", "01/01/2026", "ראייה", "יום", "", "נמחק"],
            ["", "", "", "", "", "", "", ""],
            [ts2, "not-a-number", "x", "y", "ראייה", "יום", "", "נוסף"],
            [ts2, "400", "x", "y", "סוג לא מוכר", "", "", "נוסף"],
            [ts2, "500", "x", "y", "ראייה", "יום", "", "פעולה שגויה"]
        ];

        var log = GoogleBackupManager.ParseHistoryRows(historyRows);
        Assert.Equal(4, log.Count);
        Assert.Equal(ts1, log[0].Ts);
        Assert.Equal("נוסף", log[0].Action);
        Assert.NotNull(log[0].Entry);
        Assert.Equal("reiyah", log[0].Entry!.Type);
        Assert.Equal(OnaType.Day, log[0].Entry!.Ona);

        var unknownRow = log.FirstOrDefault(r => r.Abs == 400);
        Assert.NotNull(unknownRow);
        Assert.Null(unknownRow!.Entry);
    }

    [Fact]
    public void Scenario10_RestorePoints_RecoverDeletedEvent()
    {
        string ts1 = "2026-09-01T10:00:00.000Z";
        string ts2 = "2026-09-10T10:00:00.000Z";
        List<List<string>> historyRows =
        [
            [ts1, "100", "א טבת", "01/01/2026", "ראייה", "יום", "הערה", "נוסף"],
            [ts1, "200", "ב טבת", "02/01/2026", "טבילה", "—", "", "נוסף"],
            [ts2, "100", "א טבת", "01/01/2026", "ראייה", "יום", "", "נמחק"]
        ];

        var log = GoogleBackupManager.ParseHistoryRows(historyRows);
        var points = GoogleBackupManager.BuildRestorePoints(log);

        Assert.Equal(2, points.Count);
        Assert.Equal(ts2, points[0].Ts);
        Assert.Equal(2, points[1].Count);
        Assert.True(points[1].Db.ContainsKey(100) && points[1].Db[100].Type == "reiyah");
        Assert.Equal(1, points[0].Count);
        Assert.True(points[0].Db.ContainsKey(200));
        Assert.Equal(1, points[0].Deleted);

        // Merge back into current db
        var current = new Dictionary<int, CalendarDayEntry> { [200] = new CalendarDayEntry { Type = "tevilah" } };
        var recovered = GoogleBackupManager.MergeDb(current, points[1].Db);
        Assert.Equal(2, recovered.Db.Count);
        Assert.True(recovered.Db.ContainsKey(100));
        Assert.Single(recovered.AddedKeys);
    }

    [Fact]
    public void Scenario11_SightingKindAndDuration_SurviveBackup()
    {
        var kindDb = new Dictionary<int, CalendarDayEntry>
        {
            [30000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Kind = "ones" },
            [30005] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night, Kind = "sharp", DurationDays = 4 },
            [30010] = new CalendarDayEntry { Type = "hefsek" }
        };

        var kindParsed = GoogleBackupManager.ParseBackupRows(GoogleBackupManager.BuildPayload(kindDb, "111111", ""));
        Assert.Equal("ones", kindParsed.Db[30000].Kind);
        Assert.Equal(4, kindParsed.Db[30005].DurationDays);
        Assert.Null(kindParsed.Db[30010].Kind);
        Assert.Empty(kindParsed.Db[30000].Signs);
    }

    [Fact]
    public void Scenario12_KindAndDuration_SurviveHistoryTab()
    {
        var kindHistory = GoogleBackupManager.ParseHistoryRows([
            ["2026-09-17T10:00:00.000Z", "30000", "א", "1/1/2026", "ראייה", "יום", "", "נוסף", "אונס / קפיצה", ""],
            ["2026-09-17T10:00:00.000Z", "30005", "ב", "2/1/2026", "ראייה", "לילה", "", "נוסף", "מאכל חריף", "4"]
        ]);

        Assert.Equal("ones", kindHistory[0].Entry!.Kind);
        Assert.Equal("sharp", kindHistory[1].Entry!.Kind);
        Assert.Equal(4, kindHistory[1].Entry!.DurationDays);

        var kindPoints = GoogleBackupManager.BuildRestorePoints(kindHistory);
        Assert.Equal("ones", kindPoints[0].Db[30000].Kind);
        Assert.Equal(4, kindPoints[0].Db[30005].DurationDays);
        Assert.Equal("sharp", kindPoints[0].Db[30005].Kind);
    }

    [Fact]
    public void Scenario12b_Checks_SurviveBothTabs()
    {
        var checkDb = new Dictionary<int, CalendarDayEntry>
        {
            [50000] = new CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "deep" },
            [50001] = new CalendarDayEntry { Type = "check", Ona = OnaType.Night, Depth = "wipe" }
        };

        var checkRows = GoogleBackupManager.BuildPayload(checkDb, "111111", "");
        Assert.Equal("בדיקה", checkRows[0][4]);
        Assert.Equal("יום", checkRows[0][5]);
        Assert.Equal("לילה", checkRows[1][5]);
        Assert.Equal("בדיקה כדין", checkRows[0][9]);
        Assert.Equal("קינוח בלבד", checkRows[1][9]);

        var checkParsed = GoogleBackupManager.ParseBackupRows(checkRows);
        Assert.Equal("check", checkParsed.Db[50000].Type);
        Assert.Equal("deep", checkParsed.Db[50000].Depth);
        Assert.Equal("wipe", checkParsed.Db[50001].Depth);
        Assert.Equal(OnaType.Night, checkParsed.Db[50001].Ona);

        // Unknown depth falls back to wipe (cautious)
        var unknownDepth = GoogleBackupManager.ParseBackupRows([
            ["1", "א", "1/1/2026", "60000", "בדיקה", "יום", "", "", "", "משהו אחר", ""]
        ]);
        Assert.Equal("wipe", unknownDepth.Db[60000].Depth);
    }

    [Fact]
    public void Scenario12c_BodySigns_SurviveBothTabs()
    {
        var signsDb = new Dictionary<int, CalendarDayEntry>
        {
            [70000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night, Kind = "regular", Signs = ["yawn", "faceSpots"] },
            [70001] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Kind = "ones", Signs = ["sneeze"] },
            [70002] = new CalendarDayEntry { Type = "hefsek" }
        };

        var signsRows = GoogleBackupManager.BuildPayload(signsDb, "111111", "");
        Assert.Equal("פיהוק / פצעים בפנים", signsRows[0][11]);
        Assert.Equal("", signsRows[2][11]);

        var signsParsed = GoogleBackupManager.ParseBackupRows(signsRows);
        Assert.Equal(["yawn", "faceSpots"], signsParsed.Db[70000].Signs);
        Assert.Empty(signsParsed.Db[70002].Signs);

        var signsHistory = GoogleBackupManager.ParseHistoryRows([
            ["2026-09-17T10:00:00.000Z", "70000", "א", "1/1/2026", "ראייה", "לילה", "", "נוסף", "רגילה", "", "פיהוק / פצעים בפנים"]
        ]);
        Assert.Equal(["yawn", "faceSpots"], signsHistory[0].Entry!.Signs);

        var signsPoints = GoogleBackupManager.BuildRestorePoints(signsHistory);
        Assert.Equal(["yawn", "faceSpots"], signsPoints[0].Db[70000].Signs);
    }

    [Fact]
    public void Scenario13_PreviouslyUnmappedSignCodes_NowGetRealHebrewLabels()
    {
        // cramps/blood/nausea/weakness/sharpFood/other used to have no entry in SignLabels
        // at all (it carried burp/bellyPain/loinsPain/teethPain/fever instead - codes that
        // do not exist anywhere in VesetGufManager.BODY_SIGNS) - a backed-up reiyah with one
        // of these signs wrote the raw code into the sheet instead of a Hebrew label.
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [80000] = new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day, Signs = ["cramps", "blood", "nausea", "weakness", "sharpFood", "other"] }
        };
        var rows = GoogleBackupManager.BuildPayload(db, "", "");
        string cell = rows[0][11];
        Assert.DoesNotContain("cramps", cell);
        Assert.DoesNotContain("sharpFood", cell);
        Assert.Contains("כאבים בפי כריסה", cell);
        Assert.Contains("שופעת דם טמא", cell);
        Assert.Contains("בחילה או הקאה", cell);
        Assert.Contains("חולשה", cell);
        Assert.Contains("אכילת דברים חריפים", cell);
        Assert.Contains("מיחוש אחר", cell);

        var parsed = GoogleBackupManager.ParseBackupRows(rows);
        Assert.Equal(["cramps", "blood", "nausea", "weakness", "sharpFood", "other"], parsed.Db[80000].Signs);
    }

    [Fact]
    public void Scenario14_StandaloneSignCertainty_SurvivesBackupRoundTrip()
    {
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [90000] = new CalendarDayEntry { Type = "sign", Signs = ["nausea"], SignCertainty = "likely" },
            [90001] = new CalendarDayEntry { Type = "sign", Signs = ["chills"], SignCertainty = "vague" },
            [90002] = new CalendarDayEntry { Type = "sign", Signs = ["yawn"] } // default "certain" - no suffix written
        };
        var rows = GoogleBackupManager.BuildPayload(db, "", "");
        Assert.Contains("· ודאות: סביר", rows[0][11]);
        Assert.Contains("· ודאות: מסופק", rows[1][11]);
        Assert.DoesNotContain("ודאות", rows[2][11]);

        var parsed = GoogleBackupManager.ParseBackupRows(rows);
        Assert.Equal("likely", parsed.Db[90000].SignCertainty);
        Assert.Equal(["nausea"], parsed.Db[90000].Signs);
        Assert.Equal("vague", parsed.Db[90001].SignCertainty);
        Assert.Null(parsed.Db[90002].SignCertainty);
        Assert.Equal(["yawn"], parsed.Db[90002].Signs);
    }

    [Fact]
    public void Scenario15_CheckBloodFound_SurvivesBackupRoundTrip()
    {
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [91000] = new CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "deep", BloodFound = true },
            [91001] = new CalendarDayEntry { Type = "check", Ona = OnaType.Night, Depth = "wipe", Twice = true, BloodFound = true },
            [91002] = new CalendarDayEntry { Type = "check", Ona = OnaType.Day, Depth = "deep" }
        };
        var rows = GoogleBackupManager.BuildPayload(db, "", "");
        Assert.Equal("בדיקה כדין · נמצא דם", rows[0][9]);
        Assert.Equal("קינוח בלבד · נמצא דם · פעמיים בעונה", rows[1][9]);
        Assert.Equal("בדיקה כדין", rows[2][9]);

        var parsed = GoogleBackupManager.ParseBackupRows(rows);
        Assert.True(parsed.Db[91000].BloodFound);
        Assert.Equal("deep", parsed.Db[91000].Depth);
        Assert.True(parsed.Db[91001].BloodFound);
        Assert.True(parsed.Db[91001].Twice);
        Assert.Equal("wipe", parsed.Db[91001].Depth);
        Assert.Null(parsed.Db[91002].BloodFound);
    }
}

