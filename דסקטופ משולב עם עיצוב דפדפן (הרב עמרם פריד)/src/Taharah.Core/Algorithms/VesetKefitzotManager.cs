using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

/// <summary>
/// A candidate/established "veset kefitzot" (וסת הקפיצות) - a veset caused specifically by a
/// bleed that followed physical jumping (ReiyahEvent.Kind == "kefitza"), not spontaneous bleeding.
/// Ports הלכות טהרה הר"ע פריד פרק כז חלק ב (עמ' 92-93).
/// </summary>
public sealed class KefitzotCandidate
{
    /// <summary>"month" (same day-of-month + ona), "haflagah" (equal spans + ona), or "any" (3+ jumps that all bled, regardless of date/interval - עמ' 93 סעיף יז).</summary>
    public string Kind { get; set; } = string.Empty;
    public OnaType Ona { get; set; }
    public int? DayOfMonth { get; set; }
    public int? Span { get; set; }
    public int? SpanLabel { get; set; }
    /// <summary>true once the kevi'ah threshold is met (3 for month, 4/3-equal-spans for haflagah, 3 for "any") - a real veset, not just a one-time disclosed possibility.</summary>
    public bool Established { get; set; }
    public List<int> EstablishedBy { get; set; } = [];
    public string Label { get; set; } = string.Empty;
}

/// <summary>
/// וסת הקפיצות - הלכות טהרה הר"ע פריד פרק כז חלק ב, עמ' 92-93. שלושה מסלולים עצמאיים:
///  - "month": קפצה וראתה, ושוב קפצה וראתה באותו תאריך ובאותה עונה - חוששת רק אם תקפוץ שוב
///    באותו תאריך (עמ' 92 סעיפים ח-י); שלוש פעמים קובעת וסת קבוע (עמ' 93 סעיף טו).
///  - "haflagah": כנ"ל לפי הפלגה קבועה בין הקפיצות (עמ' 93 סעיפים יב-יד, טז).
///  - "any": שלוש קפיצות שהובילו לראייה, ללא קשר לתאריך/הפלגה - חוששת לעצם הקפיצה (עמ' 93 סעיף יז).
/// שונה מהותית משאר הוסתות: אם הגיע התאריך/ההפלגה הצפויים ולא קפצה (גם אם ראתה מסיבה אחרת),
/// הוסת הזו נעקרת מיד ואינה חוזרת אפילו אם תקפוץ בחודש הבא (עמ' 92 סעיף יא) - קריאה למעלה,
/// לא הפונקציה הזו, אחראית להציג את זה כתלוי-בפעולה עתידית (לא כתחזית לוח שנה אוטומטית).
/// </summary>
public static class VesetKefitzotManager
{
    public const string KefitzaKind = "kefitza";
    public const int MonthJumpsNeeded = 3;
    public const int HaflagahJumpsNeeded = 4;
    public const int AnyJumpsNeeded = 3;

    public static List<KefitzotCandidate> AnalyzeKefitzot(List<ReiyahEvent> reiyot)
    {
        var jumps = (reiyot ?? []).Where(r => r.Kind == KefitzaKind).OrderBy(r => r.Abs).ToList();
        var result = new List<KefitzotCandidate>();
        if (jumps.Count == 0) return result;

        var last = jumps[^1];

        // "month" track: trailing run of same day-of-month + same ona, in CONSECUTIVE Hebrew
        // months, among jump-caused sightings - עמ' 92 סעיף ח frames this explicitly as
        // "בחודש הבא" (NEXT month), not any later month a jump happens to recur in.
        int monthRun = 1;
        var monthRunNewer = last;
        for (int i = jumps.Count - 2; i >= 0; i--)
        {
            var candidate = jumps[i];
            if (candidate.HDate.Day != last.HDate.Day || candidate.Ona != last.Ona) break;
            if (!VesetDilugManager.MonthsAreConsecutive(candidate.Abs, monthRunNewer.Abs)) break;
            monthRun++;
            monthRunNewer = candidate;
        }
        result.Add(new KefitzotCandidate
        {
            Kind = "month",
            Ona = last.Ona,
            DayOfMonth = last.HDate.Day,
            Established = monthRun >= MonthJumpsNeeded,
            EstablishedBy = jumps.Skip(jumps.Count - monthRun).Select(r => r.Abs).ToList(),
            Label = $"וסת הקפיצות ליום {ChazakaManager.HebDayOfMonth(last.HDate.Day)} בחודש ({(last.Ona == OnaType.Night ? "עונת לילה" : "עונת יום")})"
        });

        // "haflagah" track: trailing run of equal spans among jump-caused sightings, where
        // EVERY sighting in the window (not just some of them) shares the same ona. The
        // original version of this loop started `spans` at a hard-coded 1 without ever
        // checking jumps[^2]'s ona, and its ona check inside the loop covered jumps[i] (the
        // NEWER member of each pair) rather than jumps[i-1] (the older, newly-included one) -
        // together these left the two oldest sightings in the window completely unchecked.
        // Found and fixed via code review 2026-09-23.
        if (jumps.Count >= 2)
        {
            int span = last.Abs - jumps[^2].Abs;
            int spans = 0;
            var newer = last;
            for (int i = jumps.Count - 2; i >= 0; i--)
            {
                var older = jumps[i];
                if (newer.Abs - older.Abs != span) break;
                if (older.Ona != last.Ona) break;
                spans++;
                newer = older;
            }
            result.Add(new KefitzotCandidate
            {
                Kind = "haflagah",
                Ona = last.Ona,
                Span = span,
                SpanLabel = span + 1,
                Established = spans >= HaflagahJumpsNeeded - 1,
                EstablishedBy = jumps.Skip(jumps.Count - (spans + 1)).Select(r => r.Abs).ToList(),
                Label = $"וסת הקפיצות להפלגת {span + 1} ימים ({(last.Ona == OnaType.Night ? "עונת לילה" : "עונת יום")})"
            });
        }

        // "any" track: 3+ jumps that all resulted in bleeding, regardless of date/interval - עמ' 93 סעיף יז.
        if (jumps.Count >= AnyJumpsNeeded)
        {
            result.Add(new KefitzotCandidate
            {
                Kind = "any",
                Ona = last.Ona,
                Established = true,
                EstablishedBy = jumps.TakeLast(AnyJumpsNeeded).Select(r => r.Abs).ToList(),
                Label = "חשש קפיצה כללי - כל קפיצה עלולה להביא לראייה, אסורה עד סוף העונה אם תקפוץ"
            });
        }

        return result;
    }
}
