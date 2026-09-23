using Taharah.Core.Algorithms;
using Taharah.Core.Enums;
using Taharah.Core.Halacha;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class FertilityAndGuideTests
{
    [Fact]
    public void HalachaHelpCatalog_HasCategoriesAndTopics()
    {
        var topics = HalachaHelpCatalog.Topics;
        Assert.NotEmpty(topics);
        Assert.True(topics.Count >= 10);

        var categories = HalachaHelpCatalog.Categories;
        Assert.NotEmpty(categories);

        // Search test
        var searchResults = HalachaHelpCatalog.Search("הפסק טהרה");
        Assert.NotEmpty(searchResults);
        Assert.Contains(searchResults, t => t.Title.Contains("הפסק"));
    }

    [Fact]
    public void FertilityInsights_CalculatesMetricsCorrectly()
    {
        // 3 consecutive periods: day 100, 128, 156 (intervals 28, 28)
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [100] = new() { Type = "reiyah", Ona = OnaType.Night },
            [128] = new() { Type = "reiyah", Ona = OnaType.Night },
            [156] = new() { Type = "reiyah", Ona = OnaType.Night }
        };

        var insights = FertilityInsightsManager.Analyze(db);
        Assert.NotNull(insights);
        Assert.Equal(2, insights.TotalRecordedCycles);
        Assert.Equal(28, insights.AverageCycleLengthDays);
        Assert.Equal(28, insights.MedianCycleLengthDays);
        Assert.Equal(28, insights.ShortestCycleDays);
        Assert.Equal(28, insights.LongestCycleDays);

        // Ovulation estimation for cycle of 28 is around day 14 from last period (156 + 14 = 170)
        Assert.Equal(170, insights.EstimatedOvulationAbs);
        Assert.Equal(165, insights.FertileWindowStartAbs);
        Assert.Equal(171, insights.FertileWindowEndAbs);
    }

    [Fact]
    public void FertilityInsights_DetectsEarlyOvulationConflict()
    {
        // Cycle of 21 days (ovulation ~ day 7). Mikvah is day 12 after period (e.g. 5 days + 7 clean = day 12).
        // Ovulation happens before mikvah!
        var db = new Dictionary<int, CalendarDayEntry>
        {
            [100] = new() { Type = "reiyah", Ona = OnaType.Night },
            [121] = new() { Type = "reiyah", Ona = OnaType.Night },
            [142] = new() { Type = "reiyah", Ona = OnaType.Night },
            [154] = new() { Type = "tevilah", Ona = OnaType.Night } // Day 12 from last period
        };

        var insights = FertilityInsightsManager.Analyze(db);
        Assert.NotNull(insights);
        Assert.True(insights.IsHalachicInfertilityRisk);
        Assert.NotNull(insights.StatusMessage);
        Assert.Contains("ביוץ קודם טבילה", insights.StatusMessage);
    }
}
