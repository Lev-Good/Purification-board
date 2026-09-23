using Taharah.Core.Calendar;

namespace Taharah.Core.Tests;

public class HDateTests
{
    [Fact]
    public void ChronologyCrossCheck_AdarToNisan()
    {
        // Adar 5786 (non-leap) + 29 days lands exactly on Nisan 1 5786
        var adar1 = new HDate(1, 12, 5786);
        var nisan1 = new HDate(1, 1, 5786);
        Assert.Equal(nisan1.Abs(), adar1.Abs() + 29);
    }

    [Fact]
    public void ChronologyCrossCheck_AdarIIToNisan_LeapYear()
    {
        // Adar II 5787 + 29 days lands exactly on Nisan 1 5787
        var adarII = new HDate(1, 13, 5787);
        var nisan1 = new HDate(1, 1, 5787);
        Assert.Equal(nisan1.Abs(), adarII.Abs() + 29);
    }

    [Fact]
    public void ChronologyCrossCheck_ElulToTishrei_NewYear()
    {
        // Elul 5786 + 29 days lands exactly on Tishrei 1 5787
        var elul1 = new HDate(1, 6, 5786);
        var tishrei1 = new HDate(1, 7, 5787);
        Assert.Equal(tishrei1.Abs(), elul1.Abs() + 29);
    }

    [Fact]
    public void Roundtrip_AbsToHebrew_Consistency()
    {
        var original = new HDate(15, 8, 5785); // 15 Cheshvan 5785
        int abs = original.Abs();
        var converted = new HDate(abs);

        Assert.Equal(original.Day, converted.Day);
        Assert.Equal(original.Month, converted.Month);
        Assert.Equal(original.Year, converted.Year);
    }
}
