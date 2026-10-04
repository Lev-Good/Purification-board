using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

/// <summary>
/// Builds the data-export email payload - ported from js/app.js's sendEmailViaFormSubmit
/// (the field-by-field table content), kept separate from the actual HTTP send (a thin I/O
/// layer, EmailExportService in Taharah.Infrastructure.Backup) so the content itself is
/// unit-testable without a network call.
///
/// One known, deliberate gap vs. the JS original: a reiyah's "not counted toward
/// establishing a veset" annotation (JS: `rInfo.exclusion.text`) is omitted here, because
/// Taharah.Core.Algorithms.ReiyahEvent/ChazakaResult do not currently expose a per-reiyah
/// exclusion reason at all (a separate gap, tracked in MIGRATION_PROGRESS.md) - the reiyah
/// itself is still listed, just without that one extra explanatory sub-line.
/// </summary>
public static class EmailExportManager
{
    private static readonly Dictionary<string, string> ReiyahKindLabels = new()
    {
        ["ones"] = "אונס",
        ["sharp"] = "מאכל חריף",
        ["pills"] = "כדורים",
        ["kefitza"] = "קפיצה"
    };

    /// <summary>
    /// The ordered key/value pairs to send as the FormSubmit.co table payload. Order matters
    /// (it becomes the table row order in the received email), so this returns a list of
    /// pairs rather than a Dictionary.
    /// </summary>
    public static List<(string Key, string Value)> BuildExportPayload(
        Dictionary<int, VesetEngine.CalendarDayEntry> db,
        EngineResult engineResult,
        string? notes,
        bool includeFuture,
        bool includeHistory,
        bool includeNotes)
    {
        var payload = new List<(string, string)>
        {
            ("_subject", "ריכוז נתונים - לוח טהרת המשפחה"),
            ("_template", "table"),
            ("הודעה שצורפה", string.IsNullOrWhiteSpace(notes) ? "ללא הודעה" : notes!)
        };

        if (includeFuture)
        {
            AppendFutureData(payload, engineResult);
        }

        if (includeHistory)
        {
            AppendHistoryData(payload, db, includeNotes);
        }

        if (!includeFuture && !includeHistory)
        {
            payload.Add(("נתונים", "לא נבחרו נתונים לייצוא."));
        }

        return payload;
    }

    private static void AppendFutureData(List<(string, string)> payload, EngineResult engineResult)
    {
        var reiyot = engineResult.Reiyot;
        if (reiyot.Count == 0)
        {
            payload.Add(("נתוני פרישה עתידיים", "אין עדיין רישומי וסתות במערכת."));
            return;
        }

        for (int idx = 0; idx < reiyot.Count; idx++)
        {
            var r = reiyot[reiyot.Count - 1 - idx];
            string onaStr = r.Ona == OnaType.Day ? "עונת יום" : "עונת לילה";
            string keyName = $"📌 וסת {reiyot.Count - idx} ({r.HDate.RenderGematriya()})";

            var yh = VesetEngine.GetYomHachodeshInfo(r.HDate);
            string yhStr = string.Join(" או ", yh.Entries.Select(e => $"{new HDate(e.Abs).RenderGematriya()} ({e.Label})"));
            if (yh.Mode == "disputed") yhStr += " - מחלוקת, יש לשאול רב";

            string haflagahKodemet = r.HaflagahDiff.HasValue ? $"{r.HaflagahDiff} ימים" : "-";
            string haflagahAtidit = r.NextHaflagahDate != null ? r.NextHaflagahDate.RenderGematriya() : "-";
            string valStr = $"עונה: {onaStr} | הפלגה קודמת: {haflagahKodemet} | " +
                $"יום 30: {new HDate(r.Abs + 29).RenderGematriya()} + ל\"א: {new HDate(r.Abs + 30).RenderGematriya()} | " +
                $"יום החודש: {yhStr} | הפלגה עתידית: {haflagahAtidit}";

            payload.Add((keyName, valStr));
        }

        if (engineResult.StandingVesets.Count > 0)
        {
            string establishedStr = string.Join(" | ", engineResult.StandingVesets.Select(v =>
                $"{ChazakaManager.DescribeVeset(v)} (מכוח הראיות: {string.Join(", ", v.EstablishedBy.Select(a => new HDate(a).RenderGematriya()))})"))
                + " - מכוח הוסת הקבוע אין חוששים לשאר החששות.";
            payload.Add(("⭐ וסת קבוע שנקבע", establishedStr));
        }

        if (engineResult.PendingChecks.Count > 0)
        {
            string pendingStr = string.Join(" | ", engineResult.PendingChecks.Select(p =>
                $"{new HDate(p.Abs).RenderGematriya()} ({p.Code})"))
                + " - לא נברר שלא ראתה; אסורה לבעלה עד שתבדק.";
            payload.Add(("⏳ זמני וסת שעברו בלא בדיקה", pendingStr));
        }
    }

    private static void AppendHistoryData(List<(string, string)> payload, Dictionary<int, VesetEngine.CalendarDayEntry> db, bool includeNotes)
    {
        bool eventsFound = false;

        foreach (var abs in db.Keys.OrderByDescending(x => x))
        {
            var entry = db[abs];
            var hd = new HDate(abs);
            string typeStr = "";

            if (entry.Type == "reiyah")
            {
                string? kindText = ReiyahKindLabels.GetValueOrDefault(entry.Kind ?? "");
                string flowText = (entry.DurationDays ?? 1) > 1 ? $", נמשכה {entry.DurationDays} ימים" : "";
                typeStr = $"ראייה ({(entry.Ona == OnaType.Day ? "יום" : "לילה")}{(kindText != null ? ", " + kindText : "")}{flowText})";
            }
            else if (entry.Type == "hefsek")
            {
                typeStr = "הפסק טהרה";
            }
            else if (entry.Type == "tevilah")
            {
                typeStr = "טבילה";
            }
            else if (entry.Type == "check")
            {
                string depthLabel = CheckDepthLabels.LabelOf(entry.Depth);
                string twiceText = entry.Twice == true ? ", פעמיים בעונה" : "";
                typeStr = $"בדיקה ({depthLabel}{twiceText}, עונת {(entry.Ona == OnaType.Night ? "לילה" : "יום")})";
            }
            else if (entry.Type == "sign")
            {
                typeStr = $"מיחוש גופני בלא ראייה (עונת {(entry.Ona == OnaType.Night ? "לילה" : "יום")}: {string.Join(", ", entry.Signs.Select(VesetGufManager.BodySignLabel))})";
            }

            if (entry.StandaloneSign && entry.Type != "sign")
            {
                typeStr += $" | מיחוש גופני שתועד בלא ראייה: {string.Join(", ", entry.Signs.Select(VesetGufManager.BodySignLabel))}";
            }

            string finalStr = typeStr;
            if (includeNotes && !string.IsNullOrEmpty(entry.Note))
            {
                finalStr = string.IsNullOrEmpty(finalStr) ? $"הערה: {entry.Note}" : $"{finalStr} | הערה: {entry.Note}";
            }

            if (!string.IsNullOrEmpty(finalStr))
            {
                eventsFound = true;
                payload.Add(($"📅 אירוע ב-{hd.RenderGematriya()}", finalStr));
            }
        }

        if (!eventsFound)
        {
            payload.Add(("היסטוריית אירועים", "אין אירועים מתועדים."));
        }
    }
}
