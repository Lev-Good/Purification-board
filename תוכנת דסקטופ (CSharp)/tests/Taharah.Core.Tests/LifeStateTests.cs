using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;

namespace Taharah.Core.Tests;

public class LifeStateTests
{
    [Fact]
    public void NormalizeLifeState_GarbageInputNormalizes()
    {
        var normalized = LifeStateManager.NormalizeLifeState(null);
        Assert.Null(normalized.PregnancyAbs);
        Assert.Null(normalized.AgeYears);
        Assert.Empty(normalized.Pills);
        Assert.False(LifeStateManager.IsLifeConfigured(normalized));
    }

    [Fact]
    public void Pregnancy_Day89_FirstTrimester_NoSilek()
    {
        // 89 days: still first trimester
        int conception = 10000;
        var verdict = LifeStateManager.AnalyzeLifeState(
            new LifeStateModel { PregnancyAbs = conception },
            null,
            conception + 89);

        Assert.NotNull(verdict.Pregnant);
        Assert.True(verdict.Pregnant.FirstTrimester);
        Assert.False(verdict.Silek);
    }

    [Fact]
    public void Pregnancy_Day90_BecomesSilek()
    {
        // day 90: מסולקת דמים
        int conception = 10000;
        var verdict = LifeStateManager.AnalyzeLifeState(
            new LifeStateModel { PregnancyAbs = conception },
            null,
            conception + LifeStateManager.PregnancySilekDays);

        Assert.True(verdict.Silek);
        Assert.NotNull(verdict.Pregnant);
        Assert.True(verdict.Pregnant.Active);
        Assert.True(verdict.ExemptFromCheck);
    }

    [Fact]
    public void AddHebrewMonths_TwelveMonthsLandsSameDayNextYear()
    {
        var cheshvanBase = new HDate(1, 8, 5785);
        int after12Abs = LifeStateManager.AddHebrewMonths(cheshvanBase.Abs(), 12);
        var after12 = new HDate(after12Abs);

        Assert.Equal(1, after12.Day);
        Assert.Equal(8, after12.Month);
        Assert.Equal(5786, after12.Year);
    }
}
