using System.Text.RegularExpressions;
using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Infrastructure.Backup;

public sealed class ChangeRecord
{
    public int Abs { get; set; }
    public string Action { get; set; } = string.Empty; // "נוסף", "עודכן", "נמחק"
    public CalendarDayEntry? Entry { get; set; }
}

public sealed class HistoryRow
{
    public string Ts { get; set; } = string.Empty;
    public int Abs { get; set; }
    public string Action { get; set; } = string.Empty;
    public CalendarDayEntry? Entry { get; set; }
}

public sealed class RestorePoint
{
    public string Ts { get; set; } = string.Empty;
    public int Added { get; set; }
    public int Updated { get; set; }
    public int Deleted { get; set; }
    public int Count { get; set; }
    public Dictionary<int, CalendarDayEntry> Db { get; set; } = [];
}

public static class GoogleBackupManager
{
    private static readonly Dictionary<string, string> TypeLabels = new()
    {
        ["reiyah"] = "ראייה",
        ["hefsek"] = "הפסק טהרה",
        ["tevilah"] = "טבילה",
        ["check"] = "בדיקה",
        ["sign"] = "מיחוש גופני"
    };

    private static readonly Dictionary<string, string> TypeFromLabel = new()
    {
        ["ראייה"] = "reiyah",
        ["הפסק טהרה"] = "hefsek",
        ["טבילה"] = "tevilah",
        ["בדיקה"] = "check",
        ["מיחוש גופני"] = "sign"
    };

    private static readonly Dictionary<string, string> CheckDepthLabels = new()
    {
        ["deep"] = "בדיקה כדין",
        ["wipe"] = "קינוח בלבד"
    };

    private static readonly Dictionary<string, string> CheckDepthFromLabel = new()
    {
        ["בדיקה כדין"] = "deep",
        ["קינוח בלבד"] = "wipe"
    };

    private static readonly Dictionary<string, string> KindLabels = new()
    {
        ["regular"] = "רגילה",
        ["ones"] = "אונס",
        ["sharp"] = "מאכל חריף",
        ["pills"] = "כדורים",
        ["kefitza"] = "קפיצה"
    };

    /// <summary>Includes "אונס / קפיצה" for backward compatibility with backups written before "קפיצה" (וסת הקפיצות) became its own Kind, separate from "ones" - restoring an old backup must still round-trip, not silently drop into "regular".</summary>
    private static readonly Dictionary<string, string> KindFromLabel = new()
    {
        ["רגילה"] = "regular",
        ["אונס"] = "ones",
        ["אונס / קפיצה"] = "ones",
        ["מאכל חריף"] = "sharp",
        ["כדורים"] = "pills",
        ["קפיצה"] = "kefitza"
    };

    private static readonly Dictionary<string, string> MarkLabels = new()
    {
        ["stain"] = "כתם",
        ["fright"] = "פחד פתאום",
        ["anxiety"] = "חרדה מתמשכת",
        ["travel"] = "יציאה לדרך",
        ["chuppah"] = "ליל חופה"
    };

    private static readonly Dictionary<string, string> MarkFromLabel = MarkLabels.ToDictionary(kv => kv.Value, kv => kv.Key);

    // Mirrors js/vesetGuf.js's BODY_SIGNS exactly - this is the same list the michush UI
    // (EventEntryViewModel's Sign* checkboxes) writes, so a backed-up sign round-trips.
    private static readonly Dictionary<string, string> SignLabels = new()
    {
        ["yawn"] = "פיהוק",
        ["sneeze"] = "עיטוש",
        ["cramps"] = "כאבים בפי כריסה ובשפולי מעיה (צירי הקדחות)",
        ["heaviness"] = "כובד ראש ואיברים",
        ["chills"] = "צמרמורות",
        ["blood"] = "שופעת דם טמא מתוך דם טהור",
        ["nausea"] = "בחילה או הקאה",
        ["weakness"] = "חולשה",
        ["faceSpots"] = "פצעים בפנים",
        ["sharpFood"] = "אכילת דברים חריפים (מאכל חריף)",
        ["other"] = "מיחוש אחר, משונה וקשור לראייה"
    };

    private static readonly Dictionary<string, string> SignFromLabel = SignLabels.ToDictionary(kv => kv.Value, kv => kv.Key);

    // Certainty level (docs "יסודות הבית") - relevant only to a standalone sign (מיחוש
    // בלא ראייה). "certain" is the default and is never written, so most rows are
    // untouched; the suffix appears only for "likely"/"vague".
    private static readonly Dictionary<string, string> CertaintySuffixLabels = new()
    {
        ["likely"] = "סביר",
        ["vague"] = "מסופק"
    };
    private static readonly Dictionary<string, string> CertaintyFromLabel = new()
    {
        ["סביר"] = "likely",
        ["מסופק"] = "vague"
    };
    private static readonly Regex CertaintySuffixRe = new(@"\s*·\s*ודאות:\s*(סביר|מסופק)\s*$");

    // "וסת מעד בדיקה" (vesetFromBedika stringency) - blood found during a check. Appended
    // right after the depth label, before the "twice" suffix - see js/googleBackup.js.
    private const string BloodFoundSuffix = " · נמצא דם";

    private static string SignsCellFor(CalendarDayEntry entry)
    {
        if (entry.Type != "reiyah" && entry.Type != "sign" && !entry.StandaloneSign) return "";
        string text = string.Join(" / ", entry.Signs.Select(code => SignLabels.TryGetValue(code, out var label) ? label : code));
        bool isStandalone = entry.Type == "sign" || entry.StandaloneSign;
        if (isStandalone && entry.SignCertainty != null && CertaintySuffixLabels.TryGetValue(entry.SignCertainty, out var suffix))
        {
            text += " · ודאות: " + suffix;
        }
        return text;
    }

    private static List<string> SignsFromCell(string cell)
    {
        string withoutCertainty = CertaintySuffixRe.Replace(cell, "");
        return withoutCertainty.Split('/')
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrEmpty(p))
            .Select(label => SignFromLabel.TryGetValue(label, out var code) ? code : label)
            .ToList();
    }

    /// <summary>Certainty level of a standalone sign; "certain" (the default) when there is no suffix.</summary>
    private static string CertaintyFromSignsCell(string cell)
    {
        var m = CertaintySuffixRe.Match(cell);
        return m.Success && CertaintyFromLabel.TryGetValue(m.Groups[1].Value, out var certainty) ? certainty : "certain";
    }

    private static string MarksCellFor(CalendarDayEntry entry)
    {
        if (entry.Marks.Count == 0) return "";
        return string.Join(" / ", entry.Marks.Select(code => MarkLabels.TryGetValue(code, out var label) ? label : code));
    }

    private static List<string> MarksFromCell(string cell)
    {
        return cell.Split('/')
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrEmpty(p))
            .Select(label => MarkFromLabel.TryGetValue(label, out var code) ? code : label)
            .ToList();
    }

    private static string OnaCellFor(CalendarDayEntry entry)
    {
        if (entry.Type != "reiyah" && entry.Type != "check" && entry.Type != "sign") return "—";
        return entry.Ona == OnaType.Day ? "יום" : "לילה";
    }

    private static string KindCellFor(CalendarDayEntry entry)
    {
        if (entry.Type == "reiyah")
        {
            return entry.Kind != null && KindLabels.TryGetValue(entry.Kind, out var label) ? label : KindLabels["regular"];
        }
        if (entry.Type == "check")
        {
            string label = entry.Depth != null && CheckDepthLabels.TryGetValue(entry.Depth, out var d) ? d : CheckDepthLabels["deep"];
            if (entry.BloodFound == true) label += BloodFoundSuffix;
            if (entry.Twice == true) return label + " · פעמיים בעונה";
            return label;
        }
        return "—";
    }

    private static (string? Depth, bool Twice, List<string> Parts, bool BloodFound) ParseCheckKind(string raw)
    {
        string text = raw.Trim();
        var partMatch = Regex.Match(text, @"\(([^)]*)\)\s*$");
        string partsText = partMatch.Success ? partMatch.Groups[1].Value : "";
        string withoutParts = partMatch.Success ? text[..partMatch.Index].Trim() : text;
        bool twice = withoutParts.Contains("פעמיים");
        string label = twice ? Regex.Replace(withoutParts, @"·\s*פעמיים בעונה\s*$", "").Trim() : withoutParts;
        bool bloodFound = label.Contains("נמצא דם");
        if (bloodFound) label = Regex.Replace(label, @"·\s*נמצא דם\s*$", "").Trim();
        var parts = partsText.Split('·').Select(s => s.Trim()).Where(s => !string.IsNullOrEmpty(s)).ToList();

        string? depth = CheckDepthFromLabel.TryGetValue(label, out var d) ? d : null;
        return (depth, twice, parts, bloodFound);
    }

    public static List<List<string>> BuildPayload(Dictionary<int, CalendarDayEntry> db, string pinPlain, string recoveryEmail)
    {
        var absDays = db.Keys.OrderBy(x => x).ToList();
        var rows = new List<List<string>>();
        int serial = 0;

        foreach (var abs in absDays)
        {
            var entry = db[abs];
            serial++;
            var hd = new HDate(abs);
            string heb = hd.RenderGematriya();
            var dt = hd.Greg();
            string greg = $"{dt.Day:D2}/{dt.Month:D2}/{dt.Year}";
            string type = TypeLabels.TryGetValue(entry.Type, out var t) ? t : entry.Type;
            string ona = OnaCellFor(entry);
            string note = entry.Note ?? "";
            string kind = KindCellFor(entry);
            string duration = entry.Type == "reiyah" && entry.DurationDays > 1 ? entry.DurationDays.ToString()! : "";
            string signs = SignsCellFor(entry);
            string marks = MarksCellFor(entry);

            rows.Add([serial.ToString(), heb, greg, abs.ToString(), type, ona, note, marks, "", kind, duration, signs]);
        }

        string pinVal = string.IsNullOrEmpty(pinPlain) ? "—" : pinPlain;
        string emailVal = string.IsNullOrEmpty(recoveryEmail) ? "—" : recoveryEmail;
        rows.Add(["", "", "", "", "מטא-נתונים", "—", "קוד גיבוי של האפליקציה", pinVal, emailVal, "", "", ""]);

        return rows;
    }

    public static (Dictionary<int, CalendarDayEntry> Db, string Pin, string RecoveryEmail) ParseBackupRows(List<List<string>> values)
    {
        var db = new Dictionary<int, CalendarDayEntry>();
        string pin = "";
        string recoveryEmail = "";

        foreach (var row in values)
        {
            if (row == null || row.Count < 5) continue;
            string absRaw = row.Count > 3 ? row[3] : "";
            string typeLabel = row.Count > 4 ? row[4] : "";
            string onaLabel = row.Count > 5 ? row[5] : "";
            string note = row.Count > 6 ? row[6] : "";
            string pinCell = row.Count > 7 ? row[7] : "";
            string emailCell = row.Count > 8 ? row[8] : "";
            string kindCell = row.Count > 9 ? row[9] : "";
            string durationCell = row.Count > 10 ? row[10] : "";
            string signsCell = row.Count > 11 ? row[11] : "";

            if (!string.IsNullOrEmpty(pinCell) && Regex.IsMatch(pinCell, @"^\d{6}$")) pin = pinCell;
            if (!string.IsNullOrEmpty(emailCell) && emailCell.Contains('@')) recoveryEmail = emailCell;

            if (!int.TryParse(absRaw, out int abs) || abs <= 0) continue;
            if (!TypeFromLabel.TryGetValue(typeLabel, out var type)) continue;

            var entry = new CalendarDayEntry { Type = type, Note = note };
            var marks = MarksFromCell(pinCell).Where(m => MarkLabels.ContainsKey(m)).ToList();
            if (marks.Count > 0) entry.Marks = marks;

            if ((type == "reiyah" || type == "check" || type == "sign") && (onaLabel == "יום" || onaLabel == "לילה"))
            {
                entry.Ona = onaLabel == "יום" ? OnaType.Day : OnaType.Night;
            }

            if (type == "check")
            {
                var parsed = ParseCheckKind(kindCell);
                entry.Depth = parsed.Depth ?? "wipe";
                if (parsed.Depth != null && parsed.Twice) entry.Twice = true;
                if (parsed.BloodFound) entry.BloodFound = true;
                var signs = SignsFromCell(signsCell);
                if (signs.Count > 0)
                {
                    entry.Signs = signs;
                    entry.StandaloneSign = true;
                    string certainty = CertaintyFromSignsCell(signsCell);
                    if (certainty != "certain") entry.SignCertainty = certainty;
                }
            }

            if (type == "reiyah")
            {
                if (KindFromLabel.TryGetValue(kindCell.Trim(), out var k) && k != "regular")
                {
                    entry.Kind = k;
                }
                if (int.TryParse(durationCell, out int days) && days > 1)
                {
                    entry.DurationDays = days;
                }
                var signs = SignsFromCell(signsCell);
                if (signs.Count > 0) entry.Signs = signs;
            }

            if (type == "sign")
            {
                entry.StandaloneSign = true;
                var signs = SignsFromCell(signsCell);
                if (signs.Count > 0) entry.Signs = signs;
                string certainty = CertaintyFromSignsCell(signsCell);
                if (certainty != "certain") entry.SignCertainty = certainty;
            }

            db[abs] = entry;
        }

        return (db, pin, recoveryEmail);
    }

    public static (Dictionary<int, CalendarDayEntry> Db, List<string> AddedKeys, List<string> LocalOnlyKeys) MergeDb(
        Dictionary<int, CalendarDayEntry>? localDb,
        Dictionary<int, CalendarDayEntry>? remoteDb)
    {
        var local = localDb != null ? new Dictionary<int, CalendarDayEntry>(localDb) : [];
        var remote = remoteDb ?? [];

        var merged = new Dictionary<int, CalendarDayEntry>(local);
        var addedKeys = new List<string>();

        foreach (var kv in remote)
        {
            if (!local.ContainsKey(kv.Key))
            {
                merged[kv.Key] = kv.Value.Clone();
                addedKeys.Add(kv.Key.ToString());
            }
        }

        var localOnlyKeys = local.Keys.Where(k => !remote.ContainsKey(k)).Select(k => k.ToString()).ToList();
        return (merged, addedKeys, localOnlyKeys);
    }

    public static List<ChangeRecord> DiffDb(
        Dictionary<int, CalendarDayEntry>? prevDb,
        Dictionary<int, CalendarDayEntry>? nextDb)
    {
        var prev = prevDb ?? [];
        var next = nextDb ?? [];
        var changes = new List<ChangeRecord>();

        foreach (var kv in next)
        {
            if (!prev.TryGetValue(kv.Key, out var before))
            {
                changes.Add(new ChangeRecord { Abs = kv.Key, Action = "נוסף", Entry = kv.Value.Clone() });
            }
            else if (!before.EqualsEntry(kv.Value))
            {
                changes.Add(new ChangeRecord { Abs = kv.Key, Action = "עודכן", Entry = kv.Value.Clone() });
            }
        }

        foreach (var kv in prev)
        {
            if (!next.ContainsKey(kv.Key))
            {
                changes.Add(new ChangeRecord { Abs = kv.Key, Action = "נמחק", Entry = kv.Value.Clone() });
            }
        }

        return changes.OrderBy(c => c.Abs).ToList();
    }

    public static List<HistoryRow> ParseHistoryRows(List<List<string>> values)
    {
        var outRows = new List<HistoryRow>();
        string[] validActions = ["נוסף", "עודכן", "נמחק"];

        foreach (var row in values ?? [])
        {
            if (row == null || row.Count < 8) continue;
            string ts = row[0]?.Trim() ?? "";
            if (!int.TryParse(row[1]?.Trim(), out int abs) || abs <= 0) continue;
            string action = row[7]?.Trim() ?? "";
            if (string.IsNullOrEmpty(ts) || !validActions.Contains(action)) continue;

            string typeLabel = row.Count > 4 ? row[4]?.Trim() ?? "" : "";
            CalendarDayEntry? entry = null;

            if (TypeFromLabel.TryGetValue(typeLabel, out var type))
            {
                entry = new CalendarDayEntry
                {
                    Type = type,
                    Note = row.Count > 6 ? row[6] ?? "" : ""
                };

                string onaLabel = row.Count > 5 ? row[5]?.Trim() ?? "" : "";
                if ((type == "reiyah" || type == "check" || type == "sign") && (onaLabel == "יום" || onaLabel == "לילה"))
                {
                    entry.Ona = onaLabel == "יום" ? OnaType.Day : OnaType.Night;
                }

                if (type == "check")
                {
                    string kindCell = row.Count > 8 ? row[8] ?? "" : "";
                    var parsed = ParseCheckKind(kindCell);
                    entry.Depth = parsed.Depth ?? "wipe";
                    if (parsed.Depth != null && parsed.Twice) entry.Twice = true;
                    if (parsed.BloodFound) entry.BloodFound = true;
                    if (row.Count > 10)
                    {
                        string signsCell = row[10] ?? "";
                        var signs = SignsFromCell(signsCell);
                        if (signs.Count > 0)
                        {
                            entry.Signs = signs;
                            entry.StandaloneSign = true;
                            string certainty = CertaintyFromSignsCell(signsCell);
                            if (certainty != "certain") entry.SignCertainty = certainty;
                        }
                    }
                }

                if (type == "reiyah")
                {
                    string kindCell = row.Count > 8 ? row[8]?.Trim() ?? "" : "";
                    if (KindFromLabel.TryGetValue(kindCell, out var k) && k != "regular") entry.Kind = k;
                    if (row.Count > 9 && int.TryParse(row[9]?.Trim(), out int days) && days > 1) entry.DurationDays = days;
                    if (row.Count > 10)
                    {
                        var signs = SignsFromCell(row[10] ?? "");
                        if (signs.Count > 0) entry.Signs = signs;
                    }
                }

                if (type == "sign")
                {
                    entry.StandaloneSign = true;
                    if (row.Count > 10)
                    {
                        string signsCell = row[10] ?? "";
                        var signs = SignsFromCell(signsCell);
                        if (signs.Count > 0) entry.Signs = signs;
                        string certainty = CertaintyFromSignsCell(signsCell);
                        if (certainty != "certain") entry.SignCertainty = certainty;
                    }
                }

                if (row.Count > 11)
                {
                    var marks = MarksFromCell(row[11] ?? "").Where(m => MarkLabels.ContainsKey(m)).ToList();
                    if (marks.Count > 0) entry.Marks = marks;
                }
            }

            outRows.Add(new HistoryRow { Ts = ts, Abs = abs, Action = action, Entry = entry });
        }

        return outRows;
    }

    public static List<RestorePoint> BuildRestorePoints(List<HistoryRow> rows)
    {
        var groups = new List<string>();
        var byTs = new Dictionary<string, List<HistoryRow>>();

        foreach (var r in rows ?? [])
        {
            if (!byTs.TryGetValue(r.Ts, out var list))
            {
                list = [];
                byTs[r.Ts] = list;
                groups.Add(r.Ts);
            }
            list.Add(r);
        }

        var points = new List<RestorePoint>();
        var state = new Dictionary<int, CalendarDayEntry>();

        foreach (var ts in groups)
        {
            int added = 0;
            int updated = 0;
            int deleted = 0;

            foreach (var c in byTs[ts])
            {
                if (c.Action == "נמחק")
                {
                    state.Remove(c.Abs);
                    deleted++;
                }
                else if (c.Entry != null)
                {
                    state[c.Abs] = c.Entry.Clone();
                    if (c.Action == "נוסף") added++; else updated++;
                }
            }

            points.Add(new RestorePoint
            {
                Ts = ts,
                Added = added,
                Updated = updated,
                Deleted = deleted,
                Count = state.Count,
                Db = state.ToDictionary(kv => kv.Key, kv => kv.Value.Clone())
            });
        }

        points.Reverse();
        return points;
    }
}



