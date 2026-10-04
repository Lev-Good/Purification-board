using Taharah.Core.Calendar;

namespace Taharah.Core.Tests;

public class ZmanimTests
{
    [Fact]
    public void LocationPresets_LoadedAndValid()
    {
        Assert.NotEmpty(ZmanimManager.Locations);
        Assert.Null(ZmanimManager.LocationById(ZmanimManager.NoLocation));

        var jerusalem = ZmanimManager.LocationById("jerusalem");
        Assert.NotNull(jerusalem);
        Assert.True(jerusalem.Lat > 30 && jerusalem.Long > 30);
    }

    [Fact]
    public void DayTimes_WithoutLocation_ReturnsNull()
    {
        int abs = new HDate(15, HDate.Sivan, 5785).Abs();
        Assert.Null(ZmanimManager.DayTimes(abs, null));
        Assert.Equal(string.Empty, ZmanimManager.TimesLine(abs, null));
    }

    [Fact]
    public void DayTimes_Jerusalem_CalculatesSunriseAndSunset()
    {
        int abs = new HDate(15, HDate.Sivan, 5785).Abs();
        var jerusalem = ZmanimManager.LocationById("jerusalem");

        var times = ZmanimManager.DayTimes(abs, jerusalem);
        Assert.NotNull(times);
        Assert.Matches(@"^\d{2}:\d{2}$", times.Day.Sunrise);
        Assert.Matches(@"^\d{2}:\d{2}$", times.Day.Sunset);

        int sunriseMin = int.Parse(times.Day.Sunrise[..2]) * 60 + int.Parse(times.Day.Sunrise[3..]);
        int sunsetMin = int.Parse(times.Day.Sunset[..2]) * 60 + int.Parse(times.Day.Sunset[3..]);

        Assert.True(sunriseMin < sunsetMin, "sunrise comes before sunset");
    }

    [Fact]
    public void NightOnah_SunsetComesFromPreviousDay()
    {
        int abs = new HDate(15, HDate.Sivan, 5785).Abs();
        var jerusalem = ZmanimManager.LocationById("jerusalem");

        var times = ZmanimManager.DayTimes(abs, jerusalem);
        var prevTimes = ZmanimManager.DayTimes(abs - 1, jerusalem);

        Assert.NotNull(times);
        Assert.NotNull(prevTimes);
        Assert.Equal(prevTimes.Day.Sunset, times.Night.Sunset);
        Assert.Equal(times.Day.Sunrise, times.Night.Sunrise);
    }
}
