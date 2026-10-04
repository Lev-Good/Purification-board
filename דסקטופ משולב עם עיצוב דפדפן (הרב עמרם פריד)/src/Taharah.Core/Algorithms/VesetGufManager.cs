using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class BodySignDef
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool Classic { get; set; }
}

public sealed class BodySignVerdict
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public bool Classic { get; set; }
    public List<int> Sightings { get; set; } = [];
    public int Count { get; set; }
    public bool Fixed { get; set; }
    public List<OnaType> Ons { get; set; } = [];
    public int LastAbs { get; set; }
}

public sealed class CompoundVesetVerdict
{
    public string Kind { get; set; } = string.Empty;
    public string Sign { get; set; } = string.Empty;
    public string SignLabel { get; set; } = string.Empty;
    public OnaType Ona { get; set; }
    public int? DayOfMonth { get; set; }
    public int? Span { get; set; }
    public int? SpanLabel { get; set; }
    public int LastAbs { get; set; }
    public List<int> EstablishedBy { get; set; } = [];
}

/// <summary>A body-veset symptom (miychush) recorded WITHOUT a sighting - it still forbids from the moment it appears, and still counts toward establishing the sign.</summary>
public sealed class SignRecord
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; } = OnaType.Day;
    public List<string> Signs { get; set; } = [];
    public bool Checked { get; set; }
    public string? Certainty { get; set; }
}

public sealed class StandaloneSignEntry
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public List<string> Signs { get; set; } = [];
    public bool Checked { get; set; }
    public string Certainty { get; set; } = "certain";
}

public sealed class UnauditedSign
{
    public int Abs { get; set; }
    public List<string> Signs { get; set; } = [];
    public string Reason { get; set; } = string.Empty;
}

public sealed class BodyVesetVerdict
{
    public bool Configured { get; set; }
    public List<BodySignVerdict> BySign { get; set; } = [];
    public List<BodySignVerdict> FixedBody { get; set; } = [];
    public List<BodySignVerdict> PendingBody { get; set; } = [];
    public List<CompoundVesetVerdict> Compound { get; set; } = [];
    public List<UnauditedSign> UnauditedSigns { get; set; } = [];
    public List<StandaloneSignEntry> StandaloneSigns { get; set; } = [];
    public List<string> UnknownCodes { get; set; } = [];
    public List<string> Notes { get; set; } = [];
}

public static class VesetGufManager
{
    public const int BodyFixedCount = 3;
    public const int CompoundMonthSightings = 3;
    public const int CompoundHaflagahSightings = 4;

    public const string CompoundMonthCode = "ומ\"ח";
    public const string CompoundHaflagahCode = "ומ\"ה";

    public const string SignCertaintyDefault = "certain";
    private static readonly HashSet<string> KnownCertainties = ["certain", "likely", "vague"];

    public static readonly List<BodySignDef> BodySigns =
    [
        new() { Code = "yawn", Label = "פיהוק", Classic = true },
        new() { Code = "sneeze", Label = "עיטוש", Classic = true },
        new() { Code = "cramps", Label = "כאבים בפי כריסה ובשפולי מעיה (צירי הקדחות)", Classic = true },
        new() { Code = "heaviness", Label = "כובד ראש ואיברים", Classic = true },
        new() { Code = "chills", Label = "צמרמורות", Classic = true },
        new() { Code = "blood", Label = "שופעת דם טמא מתוך דם טהור", Classic = true },
        new() { Code = "nausea", Label = "בחילה או הקאה", Classic = false },
        new() { Code = "weakness", Label = "חולשה", Classic = false },
        new() { Code = "faceSpots", Label = "פצעים בפנים", Classic = false },
        new() { Code = "sharpFood", Label = "אכילת דברים חריפים (מאכל חריף)", Classic = false },
        new() { Code = "other", Label = "מיחוש אחר, משונה וקשור לראייה", Classic = false }
    ];

    private static readonly Dictionary<string, BodySignDef> ByCode = BodySigns.ToDictionary(s => s.Code);

    public static string BodySignLabel(string code) => ByCode.TryGetValue(code, out var def) ? def.Label : code;

    public static bool IsClassicSign(string code) => ByCode.TryGetValue(code, out var def) && def.Classic;

    public static string NormalizeSignCertainty(string? value) => value != null && KnownCertainties.Contains(value) ? value : SignCertaintyDefault;

    private sealed class SignBearer
    {
        public int Abs;
        public OnaType Ona;
        public List<string> Signs = [];
    }

    /// <summary>
    /// The trailing (most recent) run of counted sightings that all carry the given sign and
    /// satisfy an extra condition - a sighting with no sign, or that breaks the condition,
    /// ends the run right there [SHT 40 p.180]: a compound veset needs the day AND the sign
    /// together, CONSECUTIVELY.
    /// </summary>
    private static List<ReiyahEvent> TrailingSignRun(List<ReiyahEvent> list, string code, Func<ReiyahEvent, ReiyahEvent?, int, bool> matches)
    {
        var run = new List<ReiyahEvent>();
        ReiyahEvent? previous = null;
        for (int i = list.Count - 1; i >= 0; i--)
        {
            var r = list[i];
            if (!r.Signs.Contains(code)) break;
            if (!matches(r, previous, run.Count)) break;
            run.Insert(0, r);
            previous = r;
        }
        return run;
    }

    /// <summary>
    /// A compound veset (day-of-month or haflagah, combined with a body sign) established
    /// by a trailing, consecutive run of sightings that all carry the sign. Ports
    /// js/vesetGuf.js `findCompoundVesets` faithfully; operates on the full counted-sighting
    /// list (not pre-filtered by sign) so a gap sighting without the sign breaks the run.
    /// </summary>
    public static List<CompoundVesetVerdict> FindCompoundVesets(List<ReiyahEvent> list, string code)
    {
        var outList = new List<CompoundVesetVerdict>();
        if (list.Count == 0) return outList;

        var monthRun = TrailingSignRun(list, code, (r, previous, runLength) =>
            runLength == 0 || (r.HDate.Day == previous!.HDate.Day && r.Ona == previous.Ona));
        if (monthRun.Count >= CompoundMonthSightings)
        {
            var last = monthRun[^1];
            outList.Add(new CompoundVesetVerdict
            {
                Kind = "month",
                Sign = code,
                DayOfMonth = last.HDate.Day,
                Ona = last.Ona,
                LastAbs = last.Abs,
                EstablishedBy = monthRun.TakeLast(CompoundMonthSightings).Select(r => r.Abs).ToList()
            });
        }

        if (list.Count >= 2)
        {
            int span = list[^1].Abs - list[^2].Abs;
            if (span > 0)
            {
                var hafRun = TrailingSignRun(list, code, (r, previous, runLength) =>
                    runLength == 0 || (previous!.Abs - r.Abs == span && r.Ona == previous.Ona));
                if (hafRun.Count >= CompoundHaflagahSightings)
                {
                    var last = hafRun[^1];
                    outList.Add(new CompoundVesetVerdict
                    {
                        Kind = "haflagah",
                        Sign = code,
                        Span = span,
                        SpanLabel = span + 1,
                        Ona = last.Ona,
                        LastAbs = last.Abs,
                        EstablishedBy = hafRun.TakeLast(CompoundHaflagahSightings).Select(r => r.Abs).ToList()
                    });
                }
            }
        }

        return outList;
    }

    /// <summary>
    /// Analyzes the body-veset symptoms recorded on sightings (and, separately, symptoms
    /// recorded without a sighting). Three occurrences of the same sign establish a fixed
    /// body veset [SHT 39 p.158]; fewer than that is still a concern, as a non-fixed veset.
    /// A sign combined consecutively with a day-of-month or haflagah pattern establishes a
    /// compound veset [SHT 40 p.180]. Ports js/vesetGuf.js `analyzeBodyVeset`.
    /// </summary>
    public static BodyVesetVerdict AnalyzeBodyVeset(List<ReiyahEvent>? reiyot, List<ReiyahEvent>? counted = null, List<SignRecord>? signRecords = null)
    {
        var verdict = new BodyVesetVerdict();
        var all = (reiyot ?? []).OrderBy(r => r.Abs).ToList();
        var withSigns = all.Where(r => r.Signs.Count > 0).ToList();

        var standaloneSigns = (signRecords ?? [])
            .Where(r => r.Signs.Count > 0)
            .Select(r => new StandaloneSignEntry { Abs = r.Abs, Ona = r.Ona, Signs = r.Signs, Checked = r.Checked, Certainty = NormalizeSignCertainty(r.Certainty) })
            .OrderBy(s => s.Abs)
            .ToList();

        if (withSigns.Count == 0 && standaloneSigns.Count == 0) return verdict;

        var sightingList = (counted ?? all.Where(r => r.Kind != "ones").ToList()).OrderBy(r => r.Abs).ToList();

        var combined = sightingList.Select(r => new SignBearer { Abs = r.Abs, Ona = r.Ona, Signs = r.Signs })
            .Concat(standaloneSigns.Select(s => new SignBearer { Abs = s.Abs, Ona = s.Ona, Signs = s.Signs }))
            .OrderBy(x => x.Abs).ToList();

        var countedAbs = new HashSet<int>(combined.Select(x => x.Abs));
        var unauditedSigns = withSigns
            .Where(r => !countedAbs.Contains(r.Abs))
            .Select(r => new UnauditedSign
            {
                Abs = r.Abs,
                Signs = r.Signs,
                Reason = r.Kind == "ones"
                    ? "הראייה סומנה כמחמת אונס - אינה מן המניין, ולכן המיחוש אינו קובע וסת"
                    : "הראייה נמנית עם הראייה הקודמת (המשך דימום) - ולכן אין בה מיחוש נפרד הקובע וסת"
            }).ToList();

        var bySign = new List<BodySignVerdict>();
        var compound = new List<CompoundVesetVerdict>();

        foreach (var sign in BodySigns)
        {
            var forSign = combined.Where(x => x.Signs.Contains(sign.Code)).ToList();
            if (forSign.Count == 0) continue;

            bool isFixed = forSign.Count >= BodyFixedCount;
            bySign.Add(new BodySignVerdict
            {
                Code = sign.Code,
                Label = sign.Label,
                Classic = sign.Classic,
                Sightings = forSign.Select(x => x.Abs).ToList(),
                Count = forSign.Count,
                Fixed = isFixed,
                Ons = forSign.Select(x => x.Ona).Distinct().ToList(),
                LastAbs = forSign[^1].Abs
            });

            // The compound veset is evaluated on SIGHTINGS alone - a symptom recorded
            // without a sighting has no day-of-month/haflagah of its own to combine with.
            foreach (var c in FindCompoundVesets(sightingList, sign.Code))
            {
                c.SignLabel = sign.Label;
                compound.Add(c);
            }
        }

        var knownCodes = new HashSet<string>(BodySigns.Select(s => s.Code));
        var unknownCodes = new List<string>();
        foreach (var code in withSigns.SelectMany(r => r.Signs).Concat(standaloneSigns.SelectMany(s => s.Signs)))
        {
            if (!knownCodes.Contains(code) && !unknownCodes.Contains(code)) unknownCodes.Add(code);
        }

        var fixedBody = bySign.Where(s => s.Fixed).ToList();
        var pendingBody = bySign.Where(s => !s.Fixed).ToList();

        var notes = new List<string>();
        notes.Add("התנאי לסימון מיחוש - מיחוש שאינו שגרתי ומוכח שהוא שייך לביאת הוסת");
        if (bySign.Count > 0) notes.Add("עם הופעת המיחוש - אסורה כדין שעת הוסת");
        if (pendingBody.Count > 0)
        {
            notes.Add("מיחוש שתועד פעם אחת או שתיים - חוששת לו כדין וסת שאינו קבוע");
            notes.Add("עבר המיחוש ולא בדקה - אסורה עד שתבדוק (דעת הט\"ז)");
            notes.Add("מחלוקת - האם נדרשת בדיקה בוסת הגוף שאינו קבוע (הש\"ך חולק)");
            notes.Add("מחלוקת - קביעות בפעם אחת בסימני המשנה");
        }
        if (fixedBody.Count > 0)
        {
            notes.Add("וסת הגוף הקבועה - ג' פעמים לאותו מיחוש");
            notes.Add("עבר המיחוש ולא בדקה - אסורה עד שתבדוק (דעת הט\"ז)");
            notes.Add("מחלוקת - האם נדרשת בדיקה בוסת הגוף שאינו קבוע (הש\"ך חולק)");
            notes.Add("מחלוקת - קביעות בפעם אחת בסימני המשנה");
        }
        if (compound.Count > 0)
        {
            notes.Add("וסת מורכב - יום ומיחוש, בג' ראיות רצופות דוקא");
            notes.Add("היום לבדו - אף קודם שבא המיחוש");
            notes.Add("אין עונת אור זרוע לוסת המורכב");
            notes.Add("מחלוקת - עונה בינונית בוסת מורכב");
        }
        if (compound.Count > 0 && (fixedBody.Count > 0 || pendingBody.Count > 0))
        {
            notes.Add("מיחוש שבא שלא בעונתו - עדיין נחשב");
        }
        if (standaloneSigns.Count > 0)
        {
            notes.Add("מיחוש בלא ראייה - אוסר משעתו, ונספר לוסת הגוף");
            notes.Add("עבר המיחוש ולא בדקה - אסורה עד שתבדוק (דעת הט\"ז)");
        }

        return new BodyVesetVerdict
        {
            Configured = true,
            BySign = bySign,
            FixedBody = fixedBody,
            PendingBody = pendingBody,
            Compound = compound,
            UnauditedSigns = unauditedSigns,
            StandaloneSigns = standaloneSigns,
            UnknownCodes = unknownCodes,
            Notes = notes
        };
    }
}
