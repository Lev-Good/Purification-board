using Taharah.Core.Algorithms;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class ReiyaDurationTests
{
    [Fact]
    public void ExtensionOnot_OneDay_HasNoExtension()
    {
        Assert.Empty(ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, 1));
        Assert.Empty(ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, null));
    }

    [Fact]
    public void ExtensionOnot_TwoDays_ContinuesIntoNight()
    {
        var twoDays = ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, 2);
        Assert.Single(twoDays);
        Assert.Equal(100, twoDays[0].Abs);
        Assert.Equal(OnaType.Night, twoDays[0].Ona);
    }

    [Fact]
    public void ExtensionOnot_ThreeDays_ContinuesIntoNextDay()
    {
        var threeDays = ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, 3);
        Assert.Equal(2, threeDays.Count);
        Assert.Equal(OnaType.Night, threeDays[0].Ona);
        Assert.Equal(101, threeDays[1].Abs);
        Assert.Equal(OnaType.Day, threeDays[1].Ona);
    }

    [Fact]
    public void ExtensionOnot_NightStart_ContinuesNextDay()
    {
        var nightStart = ReiyaDurationManager.ExtensionOnot(100, OnaType.Night, 2);
        Assert.Single(nightStart);
        Assert.Equal(101, nightStart[0].Abs);
        Assert.Equal(OnaType.Day, nightStart[0].Ona);
    }

    [Fact]
    public void LongBleeding_FourAdditionalDaysOrMore_AddsNothing()
    {
        // ארבעה ימים נוספים ומעלה — אין צריך לחוש אלא לתחילת הראייה
        Assert.Empty(ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, 5));
        Assert.Empty(ReiyaDurationManager.ExtensionOnot(100, OnaType.Day, 9));
        Assert.True(ReiyaDurationManager.ExtensionIsTooLong(5));
        Assert.False(ReiyaDurationManager.ExtensionIsTooLong(4));
    }
}
