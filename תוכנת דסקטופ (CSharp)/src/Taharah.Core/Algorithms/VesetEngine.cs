using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public static class VesetEngine
{
    public const int ChazakaHorizonDays = 730;

    public static (int Year, int Month) ShiftHebrewMonth(int year, int month, int direction)
    {
        if (direction == 1 && month == 6)
        {
            return (year + 1, 7);
        }
        if (direction == -1 && month == 7)
        {
            return (year - 1, 6);
        }

        int m = month + direction;
        int monthsInYear = HDate.MonthsInYear(year);
        if (m > monthsInYear) m = 1;
        if (m < 1) m = monthsInYear;
        return (year, m);
    }

    /// <summary>
    /// Advances by <paramref name="months"/> whole Hebrew months, one single-month step at a
    /// time via ShiftHebrewMonth(..., 1). ShiftHebrewMonth itself is only correct for
    /// direction ±1 - its year handling is hard-coded to the two Tishrei/Elul special cases and
    /// its general branch never changes the year at all, so calling it directly with a
    /// multi-month direction (as veset "sirug"'s MonthInterval, 2 or 3) silently produces a
    /// (year, month) pair that can cycle forever without the year ever advancing - an infinite
    /// loop in ProjectFixedVeset's sirug branch, found and fixed via code review (2026-09-23;
    /// confirmed by reproducing a genuine testhost hang/crash before this fix).
    /// </summary>
    private static (int Year, int Month) ShiftHebrewMonths(int year, int month, int months)
    {
        var cur = (Year: year, Month: month);
        for (int i = 0; i < months; i++)
        {
            cur = ShiftHebrewMonth(cur.Year, cur.Month, 1);
        }
        return cur;
    }

    public static int? BuildExactDay(int day, int month, int year)
    {
        try
        {
            if (day < 1 || day > HDate.DaysInMonth(month, year))
                return null;
            var d = new HDate(day, month, year);
            return d.Abs();
        }
        catch
        {
            return null;
        }
    }

    public static int? FindNextThirtieth(int year, int month)
    {
        var cur = (year, month);
        for (int i = 0; i < 6; i++)
        {
            if (HDate.DaysInMonth(cur.month, cur.year) == 30)
            {
                return BuildExactDay(30, cur.month, cur.year);
            }
            cur = ShiftHebrewMonth(cur.year, cur.month, 1);
        }
        return null;
    }

    public static (string Mode, List<(int Abs, string Label, string Code)> Entries) GetYomHachodeshInfo(HDate hdate)
    {
        var next = ShiftHebrewMonth(hdate.Year, hdate.Month, 1);
        var sameDay = BuildExactDay(hdate.Day, next.Month, next.Year);

        if (sameDay.HasValue)
        {
            return ("single", [(sameDay.Value, "יום החודש", "יו\"ח")]);
        }

        var entries = new List<(int Abs, string Label, string Code)>();
        var shortMonthLastDay = BuildExactDay(HDate.DaysInMonth(next.Month, next.Year), next.Month, next.Year);
        if (shortMonthLastDay.HasValue)
        {
            entries.Add((shortMonthLastDay.Value, "כ\"ט בחודש החסר", "יו\"ח*"));
        }

        var laterThirtieth = FindNextThirtieth(next.Year, next.Month);
        if (laterThirtieth.HasValue && laterThirtieth.Value != shortMonthLastDay)
        {
            entries.Add((laterThirtieth.Value, "ל' בחודש שלאחריו", "יו\"ח*"));
        }

        var nextMonthFirst = BuildExactDay(1, next.Month, next.Year);
        if (nextMonthFirst.HasValue)
        {
            entries.Add((nextMonthFirst.Value, "א' בחודש הבא (בתורת ראש חודש)", "יו\"ח*"));
        }

        entries.Sort((a, b) => a.Abs.CompareTo(b.Abs));
        return ("disputed", entries);
    }

    private static void AddPrishah(Dictionary<int, List<PrishahEntry>> prishot, int absDay, string reason, OnaType ona, string code)
    {
        if (!prishot.TryGetValue(absDay, out var list))
        {
            list = [];
            prishot[absDay] = list;
        }

        if (!list.Any(p => p.Code == code && p.Ona == ona))
        {
            list.Add(new PrishahEntry
            {
                Abs = absDay,
                Ona = ona,
                Code = code,
                Reason = reason
            });
        }
    }

    public sealed class CalendarDayEntry
    {
        public string Type { get; set; } = "reiyah";
        public OnaType Ona { get; set; } = OnaType.Day;
        public int? DurationDays { get; set; }
        public string? Kind { get; set; }
        public bool? ClosedFountain { get; set; }
        public List<string> Signs { get; set; } = [];
        public bool SafekOna { get; set; }
        public string Note { get; set; } = string.Empty;
        public string? Depth { get; set; }
        public bool? Twice { get; set; }
        public List<string> CheckParts { get; set; } = [];
        public List<string> Marks { get; set; } = [];
        public bool StandaloneSign { get; set; }

        public string? SignCertainty { get; set; }

        /// <summary>Stringency vesetFromBedika: was blood actually found on a check-type record - lets it count as a sighting.</summary>
        public bool? BloodFound { get; set; }

        public CalendarDayEntry Clone() => new()
        {
            Type = Type,
            Ona = Ona,
            DurationDays = DurationDays,
            Kind = Kind,
            ClosedFountain = ClosedFountain,
            Signs = [.. Signs],
            SafekOna = SafekOna,
            Note = Note,
            Depth = Depth,
            Twice = Twice,
            CheckParts = [.. CheckParts],
            Marks = [.. Marks],
            StandaloneSign = StandaloneSign,
            SignCertainty = SignCertainty,
            BloodFound = BloodFound
        };

        public bool EqualsEntry(CalendarDayEntry? other)
        {
            if (other == null) return false;
            return Type == other.Type &&
                   Ona == other.Ona &&
                   DurationDays == other.DurationDays &&
                   Kind == other.Kind &&
                   ClosedFountain == other.ClosedFountain &&
                   Note == other.Note &&
                   Depth == other.Depth &&
                   Twice == other.Twice &&
                   Signs.SequenceEqual(other.Signs) &&
                   Marks.SequenceEqual(other.Marks) &&
                   CheckParts.SequenceEqual(other.CheckParts) &&
                   StandaloneSign == other.StandaloneSign &&
                   SafekOna == other.SafekOna;
        }
    }

    public static List<(int Abs, OnaType Ona, string Code, string Reason)> ProjectFixedVeset(
        EstablishedVeset veset,
        ReiyahEvent? lastCounted,
        int horizonDays = 60,
        int? fromAbs = null,
        string? codeOverride = null,
        string? labelOverride = null)
    {
        var entries = new List<(int Abs, OnaType Ona, string Code, string Reason)>();
        if (lastCounted == null && !fromAbs.HasValue) return entries;

        int anchorAbs = lastCounted?.Abs ?? fromAbs!.Value;
        int horizon = Math.Max(anchorAbs, fromAbs ?? anchorAbs) + horizonDays;
        bool InRange(int abs) => !fromAbs.HasValue || abs >= fromAbs.Value;

        string onaText = veset.Ona == OnaType.Night ? "עונת לילה" : "עונת יום";
        string monthCode = codeOverride ?? "וק\"ח";
        string haflagahCode = codeOverride ?? "וק\"ה";
        string label = labelOverride ?? "וסת קבוע";

        if (veset.Kind == "month")
        {
            int day = veset.DayOfMonth ?? lastCounted?.HDate.Day ?? 1;
            (int Year, int Month) cur;
            if (!fromAbs.HasValue)
            {
                var h = lastCounted?.HDate ?? new HDate(anchorAbs);
                cur = ShiftHebrewMonth(h.Year, h.Month, 1);
            }
            else
            {
                var h = new HDate(fromAbs.Value);
                cur = (h.Year, h.Month);
            }

            while (true)
            {
                var monthStart = BuildExactDay(1, cur.Month, cur.Year);
                if (!monthStart.HasValue || monthStart.Value > horizon) break;

                var exact = BuildExactDay(day, cur.Month, cur.Year);
                if (exact.HasValue)
                {
                    if (InRange(exact.Value))
                    {
                        entries.Add((exact.Value, veset.Ona, monthCode, $"{label} - יום החודש ({onaText})"));
                    }
                }
                else
                {
                    int daysInM = HDate.DaysInMonth(cur.Month, cur.Year);
                    var shortLast = BuildExactDay(daysInM, cur.Month, cur.Year);
                    if (shortLast.HasValue && shortLast.Value <= horizon && InRange(shortLast.Value))
                    {
                        entries.Add((shortLast.Value, veset.Ona, codeOverride != null ? monthCode : "וק\"ח*", $"{label} - יום החודש, מחלוקת בחודש חסר (כ\"ט בחודש החסר, {onaText})"));
                    }
                    var later30 = FindNextThirtieth(cur.Year, cur.Month);
                    if (later30.HasValue && later30.Value <= horizon && InRange(later30.Value))
                    {
                        entries.Add((later30.Value, veset.Ona, codeOverride != null ? monthCode : "וק\"ח*", $"{label} - יום החודש, מחלוקת בחודש חסר (ל' בחודש שלאחריו, {onaText})"));
                    }
                    var nextMonth1 = BuildExactDay(1, cur.Month, cur.Year);
                    if (nextMonth1.HasValue && nextMonth1.Value <= horizon && InRange(nextMonth1.Value))
                    {
                        entries.Add((nextMonth1.Value, veset.Ona, codeOverride != null ? monthCode : "וק\"ח*", $"{label} - יום החודש, מחלוקת בחודש חסר (א' בחודש הבא, בתורת ראש חודש, {onaText})"));
                    }
                }

                cur = ShiftHebrewMonth(cur.Year, cur.Month, 1);
            }
        }
        else if (veset.Kind == "haflagah")
        {
            int step = veset.Span ?? 20;
            int spanLabel = veset.SpanLabel ?? step + 1;
            for (int abs = anchorAbs + step; abs <= horizon; abs += step)
            {
                if (!InRange(abs)) continue;
                entries.Add((abs, veset.Ona, haflagahCode, $"{label} - הפלגה ({spanLabel} ימים, {onaText})"));
            }
        }
        else if (veset.Kind == "week")
        {
            int step = 7;
            for (int abs = anchorAbs + step; abs <= horizon; abs += step)
            {
                if (!InRange(abs)) continue;
                entries.Add((abs, veset.Ona, "וק\"ש", $"{label} - וסת השבוע ({onaText})"));
            }
        }
        else if (veset.Kind == "dilug" && veset.Cycle.Count > 0)
        {
            (int Year, int Month) cur;
            if (!fromAbs.HasValue)
            {
                var h = lastCounted?.HDate ?? new HDate(anchorAbs);
                cur = ShiftHebrewMonth(h.Year, h.Month, 1);
            }
            else
            {
                var h = new HDate(fromAbs.Value);
                cur = (h.Year, h.Month);
            }
            int index = 0;
            int nextIndex = veset.NextIndex ?? 0;
            while (true)
            {
                var monthStart = BuildExactDay(1, cur.Month, cur.Year);
                if (!monthStart.HasValue || monthStart.Value > horizon) break;
                int cIdx = ((nextIndex + index) % veset.Cycle.Count + veset.Cycle.Count) % veset.Cycle.Count;
                int day = veset.Cycle[cIdx];
                var exact = BuildExactDay(day, cur.Month, cur.Year);
                if (exact.HasValue && InRange(exact.Value))
                {
                    entries.Add((exact.Value, veset.Ona, VesetDilugManager.DilugCode,
                        $"{label} - וסת הדילוג (יום {ChazakaManager.HebDayOfMonth(day)} בחודש, {onaText}; {veset.Label})"));
                }
                index++;
                cur = ShiftHebrewMonth(cur.Year, cur.Month, 1);
            }
        }
        else if (veset.Kind == "sirug" && veset.DayOfMonth.HasValue && veset.MonthInterval.HasValue)
        {
            (int Year, int Month) cur;
            if (!fromAbs.HasValue)
            {
                // Unlike month/haflagah/dilug (whose phase is self-correcting via a cycle index
                // or a plain fixed step), sirug's fixed month-interval stepping needs its OWN
                // last establishing sighting as the phase anchor - not the caller's shared
                // "last counted reiyah across all history" (lastCounted/anchorAbs), which could
                // be a later, unrelated reiyah that lands in a month off-phase from the real
                // interval and would shift every future projected occurrence onto the wrong month.
                int? ownAnchorAbs = veset.EstablishedBy?.Count > 0 ? veset.EstablishedBy[^1] : null;
                var h = ownAnchorAbs.HasValue ? new HDate(ownAnchorAbs.Value) : (lastCounted?.HDate ?? new HDate(anchorAbs));
                cur = ShiftHebrewMonths(h.Year, h.Month, veset.MonthInterval.Value);
            }
            else
            {
                var h = new HDate(fromAbs.Value);
                cur = (h.Year, h.Month);
            }
            int day = veset.DayOfMonth.Value;
            while (true)
            {
                var monthStart = BuildExactDay(1, cur.Month, cur.Year);
                if (!monthStart.HasValue || monthStart.Value > horizon) break;
                var exact = BuildExactDay(day, cur.Month, cur.Year);
                if (exact.HasValue && InRange(exact.Value))
                {
                    entries.Add((exact.Value, veset.Ona, "וק\"סר",
                        $"{label} - וסת הסירוג (יום {ChazakaManager.HebDayOfMonth(day)} בחודש, {onaText}; {veset.Label})"));
                }
                cur = ShiftHebrewMonths(cur.Year, cur.Month, veset.MonthInterval.Value);
            }
        }

        return entries;
    }

    private static List<(int Abs, OnaType Ona, string Code, string Reason)> ProjectFor(
        EstablishedVeset veset, ReiyahEvent? anchor, int horizonDays, Func<EstablishedVeset, ReiyahEvent?> anchorOf)
    {
        var anchorToUse = anchorOf(veset) ?? anchor;
        return ProjectFixedVeset(veset, anchorToUse, horizonDays, veset.RestoredFromAbs);
    }

    public static EngineResult CalculateEngine(
        Dictionary<int, (string Type, OnaType Ona, int? DurationDays)> db,
        bool isOrZaruaEnabled,
        EngineOptions? options = null)
    {
        var converted = db.ToDictionary(
            kv => kv.Key,
            kv => new CalendarDayEntry
            {
                Type = kv.Value.Type,
                Ona = kv.Value.Ona,
                DurationDays = kv.Value.DurationDays
            });
        return CalculateEngine(converted, isOrZaruaEnabled, options);
    }

    public static EngineResult CalculateEngine(
        Dictionary<int, CalendarDayEntry> db,
        bool isOrZaruaEnabled,
        EngineOptions? options = null)
    {
        var result = new EngineResult();
        var absDays = db.Keys.OrderBy(x => x).ToList();
        var stringencies = options?.Stringencies;
        var reiyot = new List<ReiyahEvent>();

        foreach (var day in absDays)
        {
            var entry = db[day];
            if (entry.Type == "reiyah")
            {
                reiyot.Add(new ReiyahEvent
                {
                    Abs = day,
                    Ona = entry.Ona,
                    HDate = new HDate(day),
                    DurationDays = entry.DurationDays,
                    Kind = entry.Kind ?? "regular",
                    ClosedFountain = entry.ClosedFountain,
                    Signs = entry.Signs,
                    SafekOna = entry.SafekOna,
                    Counted = true
                });
            }
        }

        // Stringency vesetFromBedika (default off): blood found on a check-type record
        // ("ed bedika", not a sighting in the usual way) joins the sighting list under the
        // "bedikaBlood" kind, and travels through the same chazaka/akira pipeline as any
        // other sighting.
        if (Stringencies.On(stringencies, "vesetFromBedika"))
        {
            foreach (var day in absDays)
            {
                var entry = db[day];
                if (entry.Type == "check" && entry.BloodFound == true)
                {
                    reiyot.Add(new ReiyahEvent
                    {
                        Abs = day,
                        Ona = entry.Ona,
                        HDate = new HDate(day),
                        Kind = "bedikaBlood",
                        Counted = true
                    });
                }
            }
            reiyot = reiyot.OrderBy(r => r.Abs).ToList();
        }

        result.Reiyot = reiyot;

        int? today = options?.Today;
        var life = LifeStateManager.AnalyzeLifeState(options?.Life, reiyot, today);
        result.Life = life;

        int? dormancyUpToAbs = life.Dormancy?.UpToAbs;
        bool silekSuppress = dormancyUpToAbs.HasValue;
        bool IsSuppressedBySilek(ReiyahEvent r) => silekSuppress && dormancyUpToAbs.HasValue && r.Abs <= dormancyUpToAbs.Value;
        string silekSuppressedText = life.Silek
            ? "בוטל מחמת מסולקת דמים - אינה חוששת לוסתות שהיו לה קודם שנסתלקה מדמים"
            : "בוטל - חששות שהיו לה קודם הסילוק אינן חוזרות, שהרי אינה שבה אלא לוסתה הקבועה";

        bool useChazaka = options == null || options.Chazaka;
        // Stringency sharpFoodOnes (default off): the dissenting view treats a sharp-food
        // sighting like an ones/jump - excluded from the chazaka count entirely.
        // Stringency mevuchaDays (default on = Ashkenaz minhag): edot hamizrach don't hold of
        // "yemei hamevucha" at all - הלכות טהרה הר"ע פריד פרק כז חלק ו, עמ' 97 סעיף לז.
        var chazaka = useChazaka
            ? ChazakaManager.AnalyzeChazaka(reiyot, Stringencies.On(stringencies, "sharpFoodOnes"), Stringencies.On(stringencies, "mevuchaDays"))
            : null;

        if (chazaka != null)
        {
            var countedAbs = new HashSet<int>(chazaka.Counted.Select(r => r.Abs));
            foreach (var r in reiyot)
            {
                r.Counted = countedAbs.Contains(r.Abs);
                r.Establishing = chazaka.Established.Any(v => v.EstablishedBy.Contains(r.Abs));
            }
        }

        var silekReturn = chazaka != null ? SilekReturnManager.AnalyzeSilekReturn(reiyot, life, today ?? 0) : null;
        result.SilekReturn = silekReturn;

        var restoredVesets = silekReturn?.Restored ?? [];
        var returnedKeys = silekReturn?.ReturnedKeys ?? [];
        int? pillFromAbs = silekReturn?.Interlude?.Pills?.StartAbs;

        var signRecords = new List<SignRecord>();
        foreach (var day in absDays)
        {
            var entry = db[day];
            var signs = entry.Signs.Where(s => !string.IsNullOrEmpty(s)).ToList();
            if (signs.Count == 0) continue;
            if (entry.Type != "sign" && !entry.StandaloneSign) continue;
            signRecords.Add(new SignRecord
            {
                Abs = day,
                Ona = entry.Ona,
                Signs = signs,
                Checked = entry.Type == "check",
                Certainty = entry.SignCertainty
            });
        }

        var bodyVeset = VesetGufManager.AnalyzeBodyVeset(reiyot, chazaka?.Counted, signRecords);
        result.BodyVeset = bodyVeset;
        result.StandaloneSigns = bodyVeset.StandaloneSigns;

        bool CompoundReplaces(EstablishedVeset v) => bodyVeset.Compound.Any(c =>
            c.Kind == v.Kind
            && (c.Kind == "month" ? c.DayOfMonth == v.DayOfMonth : c.Span == v.Span)
            && c.Ona == v.Ona);

        if (bodyVeset.Configured)
        {
            foreach (var c in bodyVeset.Compound)
            {
                if (c.EstablishedBy.Any(a => life.Dormancy?.DisqualifiesEstablishment(a) == true))
                {
                    result.Suppressed.Add(new SuppressedEntry
                    {
                        Code = c.Kind == "month" ? VesetGufManager.CompoundMonthCode : VesetGufManager.CompoundHaflagahCode,
                        Why = "silek",
                        Reason = $"וסת מורכב - יום + מיחוש {c.SignLabel}",
                        Text = silekSuppressedText
                    });
                    continue;
                }

                var fakeVeset = new EstablishedVeset
                {
                    Kind = c.Kind,
                    Ona = c.Ona,
                    DayOfMonth = c.DayOfMonth,
                    Span = c.Span,
                    SpanLabel = c.SpanLabel
                };
                var anchor = new ReiyahEvent { Abs = c.LastAbs, HDate = new HDate(c.LastAbs), Ona = c.Ona };
                string code = c.Kind == "month" ? VesetGufManager.CompoundMonthCode : VesetGufManager.CompoundHaflagahCode;
                string label = $"וסת מורכב - יום + מיחוש {c.SignLabel}";

                var entries = ProjectFixedVeset(fakeVeset, anchor, ChazakaHorizonDays, null, code, label);
                foreach (var entry in entries)
                {
                    AddPrishah(result.Prishot, entry.Abs, entry.Reason, entry.Ona, entry.Code);
                    if (result.Prishot.TryGetValue(entry.Abs, out var list))
                    {
                        foreach (var p in list.Where(p => p.Code == entry.Code))
                        {
                            p.EstablishedConcern = true;
                        }
                    }
                }
            }
        }

        var establishedForAnalysis = new List<EstablishedVeset>();
        var displacedVesets = new List<SuppressedEntry>();

        if (chazaka != null)
        {
            foreach (var veset in chazaka.Established)
            {
                string key = SilekReturnManager.VesetKey(veset);
                if (returnedKeys.Contains(key))
                {
                    bool returnedNow = restoredVesets.Any(r => SilekReturnManager.VesetKey(r) == key);
                    displacedVesets.Add(new SuppressedEntry
                    {
                        Veset = veset,
                        Code = "וק\"ב",
                        Why = "restored",
                        Reason = ChazakaManager.DescribeVeset(veset),
                        Text = returnedNow
                            ? "הוחלף בוסת הקבועה שחזרה לאחר הסילוק - היא עומדת במקומה"
                            : "בוטל - וסת ההפלגה שחזרה מן הסילוק אין חוששין לה עד שתחזור לראות"
                    });
                    continue;
                }

                if (pillFromAbs.HasValue && SilekReturnManager.IsPillEraVeset(veset, pillFromAbs)
                    && restoredVesets.Any(r => r.Kind == veset.Kind))
                {
                    displacedVesets.Add(new SuppressedEntry
                    {
                        Veset = veset,
                        Code = "וק\"ב",
                        Why = "pills",
                        Reason = ChazakaManager.DescribeVeset(veset),
                        Text = "בוטל - אף אם על ידי הכדורים נקבע וסת אחר, אחר שהפסיקה חוזרת לוסתה הראשון"
                    });
                    continue;
                }

                if (CompoundReplaces(veset))
                {
                    displacedVesets.Add(new SuppressedEntry
                    {
                        Veset = veset,
                        Code = "וק\"ב",
                        Why = "compound",
                        Reason = ChazakaManager.DescribeVeset(veset),
                        Text = "הוחלף בוסת מורכב (יום + מיחוש) - הקביעות היא לשילוב של היום והמיחוש, ולכן אין כאן וסת קבועה של ימים, ואין עונת אור זרוע לפני היום"
                    });
                    continue;
                }

                establishedForAnalysis.Add(veset);
            }
        }

        foreach (var v in restoredVesets)
        {
            establishedForAnalysis.Add(v);
        }

        // Stringency chiburLemafrea (default off): "tzeiruf lemafrea" - a longer haflagah
        // that recurred is counted even though a shorter one appeared in between. Always
        // detected (chazaka.Chibur) for disclosure; only added as an actual standing veset
        // when the toggle is on - the book itself calls it "a stringency only, not from the
        // strict din".
        if (chazaka?.Chibur != null && Stringencies.On(stringencies, "chiburLemafrea"))
        {
            var c = chazaka.Chibur;
            establishedForAnalysis.Add(new EstablishedVeset
            {
                Kind = c.Kind,
                Ona = c.Ona,
                Span = c.Span,
                SpanLabel = c.SpanLabel,
                EstablishedBy = c.EstablishedBy
            });
        }

        // Stringency dilug (default off): a skip/interlace pattern. Always detected and
        // exposed (result.DilugCandidates) so it can be brought to a rabbi even when off;
        // only counted as a concern when the toggle is on.
        result.DilugCandidates = chazaka?.DilugCandidates ?? [];
        if (chazaka != null && Stringencies.On(stringencies, "dilug"))
        {
            foreach (var d in chazaka.DilugCandidates)
            {
                establishedForAnalysis.Add(new EstablishedVeset
                {
                    Kind = "dilug",
                    Ona = d.Ona,
                    Cycle = d.Cycle,
                    NextIndex = d.NextIndex,
                    Label = d.Label,
                    EstablishedBy = d.EstablishedBy
                });
            }
        }

        bool useAkirot = options == null || options.Akirot;
        var checks = useAkirot ? AkiraManager.ExtractChecks(db) : [];
        var stainAbs = new HashSet<int>(db.Where(kv => kv.Value.Marks.Contains("stain")).Select(kv => kv.Key));

        var lastCountedForAkirot = chazaka?.Counted?.LastOrDefault();
        ReiyahEvent? AnchorOf(EstablishedVeset veset) => veset.RestoredAnchorAbs.HasValue
            ? new ReiyahEvent { Abs = veset.RestoredAnchorAbs.Value, HDate = new HDate(veset.RestoredAnchorAbs.Value), Ona = veset.Ona }
            : lastCountedForAkirot;

        List<(int Abs, OnaType Ona, string Code)> ProjectForAkirot(EstablishedVeset veset, ReiyahEvent anchor)
        {
            int horizon = Math.Max(ChazakaHorizonDays, (options?.Today ?? 0) - anchor.Abs + 60);
            return ProjectFor(veset, anchor, horizon, AnchorOf).Select(e => (e.Abs, e.Ona, e.Code)).ToList();
        }

        bool lateBedika = Stringencies.On(stringencies, "lateBedika");
        var akirot = useAkirot ? AkiraManager.AnalyzeAkirot(new AkirotParams
        {
            Reiyot = reiyot,
            Established = establishedForAnalysis,
            LastCounted = lastCountedForAkirot,
            Checks = checks,
            Today = options?.Today ?? 0,
            PillsDays = (fromAbs, toAbs) => life.Pills.DaysBetween(fromAbs, toAbs),
            IsPillSighting = LifeStateManager.IsPillSighting,
            LateBedika = lateBedika,
            StainAbs = stainAbs,
            StainUproots = Stringencies.On(stringencies, "stainUproots"),
            AnchorOf = AnchorOf,
            Project = ProjectForAkirot
        }) : null;
        result.Akirot = akirot;

        var fixedVesets = akirot != null ? akirot.Active.Select(f => f.Veset).ToList() : establishedForAnalysis;

        bool SilekSuppressesVeset(EstablishedVeset v) => !v.Restored &&
            (life.Dormancy != null && v.EstablishedBy.Any(a => life.Dormancy.DisqualifiesEstablishment(a)));

        var standingVesets = fixedVesets.Where(v => !SilekSuppressesVeset(v)).ToList();
        result.StandingVesets = standingVesets;
        bool suppressOthers = standingVesets.Count > 0;

        if (silekReturn != null)
        {
            foreach (var restored in standingVesets.Where(v => v.Restored))
            {
                var twin = standingVesets.FirstOrDefault(v => v != restored && !v.Restored && v.Kind == restored.Kind);
                if (twin != null)
                {
                    silekReturn.Notes.Add(new SilekNote
                    {
                        Level = "dispute",
                        Title = "וסת שחזרה מן הסילוק לצד וסת שנקבעה אחריו",
                        Text = $"הוסת שחזרה ({ChazakaManager.DescribeVeset(restored)}) והוסת שנקבעה לאחר הסילוק ({ChazakaManager.DescribeVeset(twin)}) שתיהן מוצגות זו לצד זו, ואין האפליקציה מכריעה ביניהן. יש לשאול רב מה נוהג למעשה.",
                        Source = "[שט כ\"ט | עמ' 71] · [שט ל\"ה | עמ' 123]"
                    });
                }
            }
        }

        var ordinarySink = suppressOthers ? new Dictionary<int, List<PrishahEntry>>() : result.Prishot;
        var silekSink = new Dictionary<int, List<PrishahEntry>>();

        bool safekOnaBoth = Stringencies.On(stringencies, "safekOnaBoth");
        bool karetiUfaletei = Stringencies.On(stringencies, "karetiUfaletei");
        bool orZaruaDay31 = Stringencies.On(stringencies, "orZaruaDay31");
        bool haflagahFromEnd = Stringencies.On(stringencies, "haflagahFromEnd");

        // --- עונות מעורבות (mixed onot) ---
        // "ואם ראתה שלש פעמים ביום והרביעית בלילה... חוששת ביום ובלילה" `[שט ל"ג | עמ' 112]`.
        // The pattern that was completed (month or haflagah) is mirrored to the OPPOSITE ona
        // at the same veset time - keyed here by the abs of the sighting that completed it.
        var mixedOnaByAbs = new Dictionary<int, List<MixedOnaVerdict>>();
        foreach (var m in chazaka?.MixedOna ?? [])
        {
            if (!mixedOnaByAbs.TryGetValue(m.LastAbs, out var mixedList))
            {
                mixedList = [];
                mixedOnaByAbs[m.LastAbs] = mixedList;
            }
            mixedList.Add(m);
        }
        string OnaName(OnaType ona) => ona == OnaType.Night ? "עונת לילה" : "עונת יום";

        // --- משיכת הראייה (§9.1 - ReiyaDurationManager.cs) ---
        // "עונת הוסת נחשבת העונה שהתחילה לראות בה אף אם נמשכה ראייתה כמה ימים. וכשנמשכה
        // ראיתה גם בעונה הסמוכה צריכה לחוש גם לסמוכה כשיעור שנמשכה ראייתה. ורק אם נמשכה ד'
        // ימים נוספים אין צריך לחוש אלא לתחילת ראייתה" `[ד"ט | עמ' 1]`.
        // המשך הדימום נרשם על הראייה המאוחרת (ClosedFountain == false), ואילו מניין
        // החששות חייב להימנות מן הראייה שבה החל הדימום - היא הראייה שהמנוע סימן כמקור
        // המיזוג (chazaka.Excluded, Reason == "continuation").
        var durationDaysByStartAbs = new Dictionary<int, int>();
        foreach (var r in reiyot)
        {
            if (r.ClosedFountain != false) continue;
            if (!r.DurationDays.HasValue || r.DurationDays.Value <= 1) continue;
            var mergedInto = (chazaka?.Excluded ?? []).FirstOrDefault(e => e.Abs == r.Abs && e.Reason == "continuation")?.MergedInto;
            int startAbs = mergedInto ?? r.Abs;
            durationDaysByStartAbs[startAbs] = Math.Max(durationDaysByStartAbs.GetValueOrDefault(startAbs), r.DurationDays.Value);
        }

        // --- הפסק טהרה, שבעה נקיים, וליל הטבילה ---
        // מחושב כאן, לפני חששות הראייה, מפני שעונת אור זרוע נדחית מפני ליל טבילה
        // (ראו DayMarksManager.OrZaruaExemptionFor).
        var dayMarksMap = db.ToDictionary(kv => kv.Key, kv => kv.Value.Marks);
        var tevilotSet = new HashSet<int>();
        var hefsekim = absDays.Where(d => db[d].Type == "hefsek").ToList();
        foreach (var hefsekAbs in hefsekim)
        {
            bool isInterrupted = absDays.Any(d =>
                (db[d].Type == "reiyah" || db[d].Type == "hefsek") &&
                d > hefsekAbs && d <= hefsekAbs + 7);
            if (isInterrupted) continue;

            for (int n = 1; n <= 7; n++)
            {
                result.Nekiim.Add(hefsekAbs + n);
            }

            int expectedTevilah = hefsekAbs + 7;
            int? nextInterrupt = absDays
                .Where(d => (db[d].Type == "reiyah" || db[d].Type == "hefsek") && d > hefsekAbs + 7)
                .Select(d => (int?)d)
                .FirstOrDefault();
            int? manualTevilah = absDays
                .Where(d => db[d].Type == "tevilah" && d > hefsekAbs && (!nextInterrupt.HasValue || d < nextInterrupt.Value))
                .Select(d => (int?)d)
                .FirstOrDefault();

            int tevilahAbs = (!manualTevilah.HasValue || manualTevilah.Value <= expectedTevilah)
                ? expectedTevilah + 1
                : manualTevilah.Value;

            result.Tevilot.Add(tevilahAbs);
            tevilotSet.Add(tevilahAbs);
        }

        // עונת אור זרוע, עם הפטורים (ליל טבילה / ליל חופה / יציאה לדרך) - במקום
        // ApplyOrZarua הסטטית לשעבר, כעת פונקציה מקומית הסוגרת על dayMarksMap/tevilotSet.
        void ApplyOrZarua(Dictionary<int, List<PrishahEntry>> prishot, int baseAbs, OnaType baseOna, string reasonDesc)
        {
            int shiftAbs = baseOna == OnaType.Day ? baseAbs : baseAbs - 1;
            OnaType shiftOna = baseOna == OnaType.Day ? OnaType.Night : OnaType.Day;
            var exemption = DayMarksManager.OrZaruaExemptionFor(shiftAbs, shiftOna, dayMarksMap, tevilotSet);
            if (exemption != null)
            {
                result.OrZaruaExemptions.Add(new OrZaruaExemption
                {
                    Abs = exemption.Abs,
                    Ona = exemption.Ona,
                    Code = exemption.Code,
                    Label = exemption.Label,
                    Reason = $"{exemption.Reason} - נוסף עבור: {reasonDesc}",
                    Source = exemption.Source
                });
                return;
            }

            if (baseOna == OnaType.Day)
            {
                AddPrishah(prishot, baseAbs, reasonDesc, OnaType.Night, "עוא\"ז");
            }
            else
            {
                AddPrishah(prishot, baseAbs - 1, reasonDesc, OnaType.Day, "עוא\"ז");
            }
        }

        for (int i = 0; i < reiyot.Count; i++)
        {
            var current = reiyot[i];
            string onaText = current.Ona == OnaType.Day ? "עונת יום" : "עונת לילה";
            var daySink = IsSuppressedBySilek(current) ? silekSink : ordinarySink;
            bool noOrZarua = LifeStateManager.IsPillSighting(current);

            // Stringency safekOnaBoth (default off): when a sighting is marked "safek ona"
            // (uncertain which onah it started in) near the day/night boundary, every
            // concern of hers is marked in BOTH onot rather than the later one alone.
            var sightingOnot = new List<(OnaType Ona, string Note)> { (current.Ona, "") };
            if (safekOnaBoth && current.SafekOna)
            {
                var prev = ReiyaDurationManager.PreviousOna(current.Abs, current.Ona);
                sightingOnot.Add((prev.Ona, " · ספק עונה - לחוש אף לעונה הקודמת (מתג חומרא)"));
            }

            if (durationDaysByStartAbs.TryGetValue(current.Abs, out var sightingDurationDays))
            {
                foreach (var ext in ReiyaDurationManager.ExtensionOnot(current.Abs, current.Ona, sightingDurationDays))
                {
                    sightingOnot.Add((ext.Ona, $" · {ReiyaDurationManager.ExtensionNote}"));
                }
            }

            // החשש שבעונה שכנגד, של אותה תבנית שהגיעה אליה הראייה האחרונה (עונות מעורבות).
            var mixedHere = mixedOnaByAbs.TryGetValue(current.Abs, out var mixedList) ? mixedList : [];
            OnaType? mirrorOna = mixedHere.Count > 0 ? (current.Ona == OnaType.Night ? OnaType.Day : OnaType.Night) : null;
            void AddMixedMirror(int abs, string kind)
            {
                var m = mixedHere.FirstOrDefault(x => x.Kind == kind);
                if (m == null || mirrorOna == null) return;
                // הזמן שנוסף הוא זמן הוסת של אותה תבנית - ולא זמן אחר של אותה ראייה.
                if (kind == "month" && current.HDate.Day != m.DayOfMonth) return;
                if (kind == "haflagah" && abs != current.Abs + m.Span) return;

                AddPrishah(daySink, abs,
                    $"עונות מעורבות - ג' ראיות ב{OnaName(m.FirstOna)} והרביעית ב{OnaName(m.LastOna)} (חוששת ליום וללילה)",
                    mirrorOna.Value, "עו\"מ");
                if (isOrZaruaEnabled && !noOrZarua)
                {
                    ApplyOrZarua(daySink, abs, mirrorOna.Value, "אור זרוע לעונות מעורבות");
                }
            }

            void AddForSighting(int abs, string reason, string code)
            {
                foreach (var (ona, note) in sightingOnot)
                {
                    AddPrishah(daySink, abs, reason + note, ona, code);
                }
            }
            void OrZaruaForSighting(int abs, string reasonDesc, bool allow = true)
            {
                if (!isOrZaruaEnabled || noOrZarua || !allow) return;
                foreach (var (ona, _) in sightingOnot)
                {
                    ApplyOrZarua(daySink, abs, ona, reasonDesc);
                }
            }

            int beinonitAbs = current.Abs + 29;
            AddForSighting(beinonitAbs, $"עונה בינונית ({onaText})", "עו\"ב");
            OrZaruaForSighting(beinonitAbs, "אור זרוע לעונה בינונית");

            // Stringency karetiUfaletei (default off): the Ashkenazi custom of extending
            // the day-30 (ona beinonit) separation to a full 24 hours, not just the onah of
            // the sighting - so the OPPOSITE onah is marked too. No Or Zarua for this extra
            // entry (it is a custom of separation, not the veset time itself).
            if (karetiUfaletei)
            {
                var oppositeOna = current.Ona == OnaType.Day ? OnaType.Night : OnaType.Day;
                string oppositeText = oppositeOna == OnaType.Day ? "עונת יום" : "עונת לילה";
                AddPrishah(daySink, beinonitAbs, $"עונה בינונית - כרתי ופלתי (הרחבה ליממה שלמה, {oppositeText})", oppositeOna, "עו\"ב");
            }

            int beinonit31Abs = current.Abs + 30;
            AddForSighting(beinonit31Abs, $"עונה בינונית - ל\"א ({onaText})", "עו\"ל");
            // Stringency orZaruaDay31 (default ON - existing custom): "מן הדין אין צריכה...
            // ולמעשה יש להחמיר" - the day-31 Or Zarua shift is itself the stringency.
            OrZaruaForSighting(beinonit31Abs, "אור זרוע לעונה בינונית (ל\"א)", orZaruaDay31);

            var yomHachodesh = GetYomHachodeshInfo(current.HDate);
            foreach (var entry in yomHachodesh.Entries)
            {
                string reason = yomHachodesh.Mode == "disputed"
                    ? $"יום החודש - מחלוקת ({entry.Label}, {onaText})"
                    : $"יום החודש ({onaText})";
                AddForSighting(entry.Abs, reason, entry.Code);
                OrZaruaForSighting(entry.Abs, "אור זרוע ליום החודש");
                AddMixedMirror(entry.Abs, "month");
            }

            if (i > 0)
            {
                var prev = reiyot[i - 1];
                // Stringency haflagahFromEnd (default off): a multi-day sighting's haflagah
                // is counted from its FIRST day by default ("the onah counted is the one
                // bleeding started in"); the stringency counts from its LAST day instead.
                int prevDuration = prev.DurationDays ?? 1;
                int prevAnchor = haflagahFromEnd ? prev.Abs + prevDuration - 1 : prev.Abs;
                int diff = current.Abs - prevAnchor;
                string fromEndNote = (haflagahFromEnd && prevDuration > 1)
                    ? $" · מנין מסוף הראייה (הראייה הקודמת נמשכה {prevDuration} ימים)"
                    : "";

                int halachicSpan = diff + 1;
                int nextHaflagahAbs = current.Abs + diff;

                AddForSighting(nextHaflagahAbs, $"הפלגה ({halachicSpan} ימים, {onaText}){fromEndNote}", "עו\"ה");
                OrZaruaForSighting(nextHaflagahAbs, "אור זרוע לעונת הפלגה");
                AddMixedMirror(nextHaflagahAbs, "haflagah");

                current.HaflagahDiff = halachicSpan;
                current.NextHaflagahDate = new HDate(nextHaflagahAbs);
            }
        }

        if (silekSuppress)
        {
            foreach (var kv in silekSink)
            {
                foreach (var p in kv.Value)
                {
                    result.Suppressed.Add(new SuppressedEntry
                    {
                        Code = p.Code,
                        Why = "silek",
                        Text = silekSuppressedText,
                        Reason = p.Reason
                    });
                }
            }

            foreach (var veset in establishedForAnalysis.Where(SilekSuppressesVeset))
            {
                result.Suppressed.Add(new SuppressedEntry
                {
                    Code = "וק\"ב",
                    Why = "silek",
                    Reason = ChazakaManager.DescribeVeset(veset),
                    Text = life.Silek
                        ? "בוטל מחמת מסולקת דמים - מעוברת ומניקה אינה חוששת לוסתה הראשון אפילו היה לה וסת קבוע"
                        : "בוטל - ראייה שבתוך ימי הסילוק אינה קובעת וסת, וחוזרת דוקא לוסתה שהיתה קבועה קודם הסילוק"
                });
            }
        }

        foreach (var d in displacedVesets)
        {
            result.Suppressed.Add(d);
        }

        if (suppressOthers)
        {
            foreach (var kv in ordinarySink)
            {
                foreach (var p in kv.Value)
                {
                    result.Suppressed.Add(new SuppressedEntry
                    {
                        Code = p.Code,
                        Why = "fixed",
                        Reason = p.Reason,
                        Text = "בוטל מכוח וסת קבוע - הוסת הקבוע מחליף את שאר החששות"
                    });
                }
            }

            var lastCounted = chazaka?.Counted?.LastOrDefault();
            foreach (var veset in standingVesets)
            {
                var anchor = veset.RestoredAnchorAbs.HasValue
                    ? new ReiyahEvent { Abs = veset.RestoredAnchorAbs.Value, HDate = new HDate(veset.RestoredAnchorAbs.Value), Ona = veset.Ona }
                    : lastCounted;

                var entries = ProjectFixedVeset(veset, anchor, ChazakaHorizonDays, veset.RestoredFromAbs);
                foreach (var entry in entries)
                {
                    AddPrishah(result.Prishot, entry.Abs, entry.Reason, entry.Ona, entry.Code);
                    if (isOrZaruaEnabled)
                    {
                        ApplyOrZarua(result.Prishot, entry.Abs, entry.Ona, "אור זרוע לוסת קבוע");
                    }
                }
            }
        }

        // Stringency checkUprootNonFixed (default off): the minority view that even a
        // non-fixed veset time is not uprooted without a proper check.
        bool requireCheckToUproot = Stringencies.On(stringencies, "checkUprootNonFixed");
        if (akirot != null && !suppressOthers)
        {
            foreach (var abs in result.Prishot.Keys.OrderBy(x => x).ToList())
            {
                var list = result.Prishot[abs];
                if (list.Any(p => p.Code.StartsWith("וק") || p.EstablishedConcern)) continue;
                if (!AkiraManager.IsConcernUprooted(abs, reiyot, options?.Today ?? 0)) continue;
                if (requireCheckToUproot && list.Any(p =>
                    !AkiraManager.IsConcernClarified(result.Prishot, abs, p.Ona, p.Code, reiyot, checks, lateBedika)))
                {
                    continue;
                }

                foreach (var p in list)
                {
                    p.Uprooted = true;
                    p.Reason = $"{p.Reason} · נעקר (עבר הזמן ולא ראתה) ";
                    result.Uprooted.Add(new PrishahEntry { Abs = abs, Ona = p.Ona, Code = p.Code, Reason = p.Reason });
                }
            }
        }

        // --- פחד פתאום (ביעתותא) וחרדה מתמשכת ---
        // מחושב תמיד (בניגוד לתביעת הבדיקה עצמה, שנשלטת במתג frightBedika) - כך שלוח מצב
        // יומי יוכל להציג מה עדיין לא נברר, בלי תלות במתג.
        bool requireFrightBedika = Stringencies.On(stringencies, "frightBedika");
        var frightDaysList = db.Where(kv => kv.Value.Marks.Contains("fright")).Select(kv => kv.Key).OrderBy(x => x).ToList();
        var anxietyDaysList = db.Where(kv => kv.Value.Marks.Contains("anxiety")).Select(kv => kv.Key).OrderBy(x => x).ToList();
        var openFrightDays = new List<FrightDayInfo>();
        var settledFrightDays = new List<FrightDayInfo>();
        foreach (var frightAbs in frightDaysList)
        {
            bool frightSighting = reiyot.Any(r => r.Abs == frightAbs);
            bool frightProperCheck = checks.Any(c => c.Abs == frightAbs && c.Depth == "deep");
            bool frightWipeOnly = !frightProperCheck && checks.Any(c => c.Abs == frightAbs);
            bool frightResolved = frightSighting || frightProperCheck;
            var frightItem = new FrightDayInfo
            {
                Abs = frightAbs,
                Sighting = frightSighting,
                ProperCheck = frightProperCheck,
                WipeOnly = frightWipeOnly,
                Resolved = frightResolved,
                DemandsBedikah = requireFrightBedika && !frightResolved,
                DayExemptFromCheck = life.ExemptFromCheck
            };
            (frightResolved ? settledFrightDays : openFrightDays).Add(frightItem);
        }
        result.Fright = new FrightVerdict
        {
            Days = frightDaysList,
            Open = openFrightDays,
            Settled = settledFrightDays,
            DemandsBedikah = requireFrightBedika,
            AnxietyDays = anxietyDaysList
        };

        if (akirot != null)
        {
            if (life.ExemptFromCheck)
            {
                result.CheckExemption = new CheckExemptionInfo { Exempt = true, Reason = life.ExemptReason };
            }
            else
            {
                var baseline = suppressOthers
                    ? akirot.PendingChecks.ToList()
                    : AkiraManager.FindPendingChecks(result.Prishot, reiyot, checks, options?.Today ?? 0, lateBedika);

                // Stringency vesetHagufBedika (default ON - the Taz's view): a compound
                // veset (day + sign) that passed with no check demands its own check on its
                // own time, even alongside a standing days-veset. Off = the Shach's view -
                // no extra demand beyond the ordinary baseline.
                bool vesetHagufBedika = Stringencies.On(stringencies, "vesetHagufBedika");
                var compoundConcerns = vesetHagufBedika
                    ? result.Prishot
                        .Select(kv => (Abs: kv.Key, List: kv.Value.Where(p => p.EstablishedConcern).ToList()))
                        .Where(x => x.List.Count > 0)
                        .ToDictionary(x => x.Abs, x => x.List)
                    : [];

                if (compoundConcerns.Count == 0)
                {
                    result.PendingChecks = baseline.OrderBy(x => x.Abs).ToList();
                }
                else
                {
                    var bodyPendings = AkiraManager.FindPendingChecks(compoundConcerns, reiyot, checks, options?.Today ?? 0, lateBedika)
                        .Select(p => new PendingCheckEntry
                        {
                            Abs = p.Abs,
                            Ona = p.Ona,
                            Code = p.Code,
                            Kind = "body",
                            Reason = p.Reason + " - ולהלכה אף בוסת הגוף שאינה קבועה: אסורה עד שתבדוק"
                        }).ToList();
                    var bodyKeys = new HashSet<string>(bodyPendings.Select(x => $"{x.Abs}|{x.Ona}|{x.Code}"));
                    result.PendingChecks = bodyPendings
                        .Concat(baseline.Where(x => !bodyKeys.Contains($"{x.Abs}|{x.Ona}|{x.Code}")))
                        .OrderBy(x => x.Abs).ToList();
                }

                // Stringency frightBedika (default off, the Chatam Sofer's view): "sudden
                // fright" (dayMarks 'fright') that was never resolved by a sighting or a
                // proper check demands one too - the Gr"sh Kluger's dissenting view.
                if (requireFrightBedika && result.Fright.Open.Count > 0)
                {
                    foreach (var f in result.Fright.Open)
                    {
                        result.PendingChecks.Add(new PendingCheckEntry
                        {
                            Abs = f.Abs,
                            Ona = db[f.Abs].Ona,
                            Code = "בהלה",
                            Kind = "fright",
                            Reason = "פחד פתאום (ביעתותא) שתועד ולא נברר - יש לבדוק בדיקה כדין - בעומק ובחו\"ס"
                        });
                    }
                    result.PendingChecks = result.PendingChecks.OrderBy(x => x.Abs).ToList();
                }
            }
        }

        var pillPause = PillPauseManager.AnalyzePillPause(life, reiyot, options?.Today);
        result.PillPause = pillPause;
        if (pillPause.Configured)
        {
            foreach (var c in pillPause.Concerns)
            {
                AddPrishah(result.Prishot, c.Abs, c.Reason, c.Ona, c.Code);
            }
        }

        return result;
    }
}




