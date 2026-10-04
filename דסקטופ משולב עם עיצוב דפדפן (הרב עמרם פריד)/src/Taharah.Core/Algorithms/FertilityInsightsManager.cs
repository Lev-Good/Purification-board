using Taharah.Core.Calendar;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Algorithms;

public record FertilityCycleReport(
    double AverageCycleLengthDays,
    double MedianCycleLengthDays,
    int ShortestCycleDays,
    int LongestCycleDays,
    int TotalRecordedCycles,
    int? LastReiyahAbs,
    int? EstimatedNextReiyahAbs,
    int? EstimatedOvulationAbs,
    int? FertileWindowStartAbs,
    int? FertileWindowEndAbs,
    int? ExpectedTevilahAbs,
    bool IsHalachicInfertilityRisk,
    string StatusMessage,
    string MedicalDisclaimer);

public static class FertilityInsightsManager
{
    public const int DefaultLutealPhaseDays = 14;
    public const int DefaultCycleLengthDays = 28;

    public const string Disclaimer =
        "הבהרה: המידע המוצג מתבסס על מודלים סטטיסטיים של לוח השנה. " +
        "חישוב זה הינו משוער בלבד, ואינו מהווה תחליף לייעוץ רפואי, " +
        "בדיקות מעבדה (ערכות ביוץ/אולטרסאונד), או אמצעי מניעה בטוח.";

    public static FertilityCycleReport Analyze(
        Dictionary<int, CalendarDayEntry> db,
        int? fixedHaflagah = null,
        int lutealPhaseDays = DefaultLutealPhaseDays)
    {
        // Extract regular sightings
        var sightings = db
            .Where(kv => kv.Value.Type == "reiyah" && kv.Value.Kind != "ones" && kv.Value.Kind != "continuation")
            .Select(kv => kv.Key)
            .OrderBy(x => x)
            .ToList();

        if (sightings.Count == 0)
        {
            return new FertilityCycleReport(
                AverageCycleLengthDays: DefaultCycleLengthDays,
                MedianCycleLengthDays: DefaultCycleLengthDays,
                ShortestCycleDays: DefaultCycleLengthDays,
                LongestCycleDays: DefaultCycleLengthDays,
                TotalRecordedCycles: 0,
                LastReiyahAbs: null,
                EstimatedNextReiyahAbs: null,
                EstimatedOvulationAbs: null,
                FertileWindowStartAbs: null,
                FertileWindowEndAbs: null,
                ExpectedTevilahAbs: null,
                IsHalachicInfertilityRisk: false,
                StatusMessage: "טרם תועדו ראיות במסד הנתונים.",
                MedicalDisclaimer: Disclaimer);
        }

        int lastSighting = sightings[^1];

        // Find last hefsek or explicit tevilah after last sighting to estimate immersion
        int? lastHefsek = db
            .Where(kv => kv.Value.Type == "hefsek" && kv.Key >= lastSighting)
            .Select(kv => (int?)kv.Key)
            .OrderByDescending(x => x)
            .FirstOrDefault();

        int? explicitTevilah = db
            .Where(kv => kv.Value.Type == "tevilah" && kv.Key >= lastSighting)
            .Select(kv => (int?)kv.Key)
            .OrderByDescending(x => x)
            .FirstOrDefault();

        int? expectedTevilah = explicitTevilah ?? (lastHefsek.HasValue ? lastHefsek.Value + 7 : null);

        // Calculate intervals (haflagot)
        var intervals = new List<int>();
        for (int i = 1; i < sightings.Count; i++)
        {
            int diff = sightings[i] - sightings[i - 1];
            if (diff >= 18 && diff <= 65) // Filter biologically realistic menstrual cycles
            {
                intervals.Add(diff);
            }
        }

        double avgCycle = fixedHaflagah.HasValue
            ? fixedHaflagah.Value
            : (intervals.Count > 0 ? intervals.Average() : DefaultCycleLengthDays);

        double medianCycle = intervals.Count > 0
            ? CalculateMedian(intervals)
            : avgCycle;

        int shortest = intervals.Count > 0 ? intervals.Min() : (int)Math.Round(avgCycle);
        int longest = intervals.Count > 0 ? intervals.Max() : (int)Math.Round(avgCycle);

        int estimatedCycle = (int)Math.Round(avgCycle);
        int nextReiyah = lastSighting + estimatedCycle;
        int ovulationDay = nextReiyah - lutealPhaseDays;
        int fertileStart = ovulationDay - 5;
        int fertileEnd = ovulationDay + 1;

        // Detect Halachic Infertility: ovulation occurs before immersion (Tevilah)
        bool infertilityRisk = false;
        string statusMsg;

        if (expectedTevilah.HasValue && ovulationDay <= expectedTevilah.Value)
        {
            infertilityRisk = true;
            statusMsg = "לתשומת לבכם: יום הביוץ המשוער חל לפני ליל הטבילה (ביוץ קודם טבילה). " +
                        "מצב זה מוכר ושכיח, וניתן לפתרון פשוט באמצעות התייעצות קצרה עם רב מורה הוראה ורופא/ת נשים.";
        }
        else
        {
            statusMsg = $"מחזור משוער: כ-{estimatedCycle} ימים. חלון הפוריות נפתח כ-5 ימים לפני מועד הביוץ המשוער.";
        }

        return new FertilityCycleReport(
            AverageCycleLengthDays: Math.Round(avgCycle, 1),
            MedianCycleLengthDays: Math.Round(medianCycle, 1),
            ShortestCycleDays: shortest,
            LongestCycleDays: longest,
            TotalRecordedCycles: intervals.Count,
            LastReiyahAbs: lastSighting,
            EstimatedNextReiyahAbs: nextReiyah,
            EstimatedOvulationAbs: ovulationDay,
            FertileWindowStartAbs: fertileStart,
            FertileWindowEndAbs: fertileEnd,
            ExpectedTevilahAbs: expectedTevilah,
            IsHalachicInfertilityRisk: infertilityRisk,
            StatusMessage: statusMsg,
            MedicalDisclaimer: Disclaimer);
    }

    private static double CalculateMedian(List<int> numbers)
    {
        var sorted = numbers.OrderBy(n => n).ToList();
        int count = sorted.Count;
        if (count % 2 == 1)
        {
            return sorted[count / 2];
        }
        return (sorted[(count / 2) - 1] + sorted[count / 2]) / 2.0;
    }
}
