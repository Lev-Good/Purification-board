namespace Taharah.Core.Calendar;

public sealed class LocationDef
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public double Lat { get; set; }
    public double Long { get; set; }
    public string Tzid { get; set; } = string.Empty;
}

public sealed class DayTimesResult
{
    public (string Sunrise, string Sunset) Day { get; set; }
    public (string Sunset, string Sunrise) Night { get; set; }
}

public sealed class DayTimesRawResult
{
    public (DateTime Sunrise, DateTime Sunset) Day { get; set; }
    public (DateTime Sunset, DateTime Sunrise) Night { get; set; }
}

public static class ZmanimManager
{
    public const string NoLocation = "";

    public static readonly List<LocationDef> Locations =
    [
        new() { Id = "jerusalem", Label = "ירושלים", Lat = 31.7683, Long = 35.2137, Tzid = "Asia/Jerusalem" },
        new() { Id = "telaviv", Label = "תל אביב", Lat = 32.0853, Long = 34.7818, Tzid = "Asia/Jerusalem" },
        new() { Id = "bneibrak", Label = "בני ברק", Lat = 32.0807, Long = 34.8338, Tzid = "Asia/Jerusalem" },
        new() { Id = "beitshemesh", Label = "בית שמש", Lat = 31.7487, Long = 34.9880, Tzid = "Asia/Jerusalem" },
        new() { Id = "ashdod", Label = "אשדוד", Lat = 31.8014, Long = 34.6435, Tzid = "Asia/Jerusalem" },
        new() { Id = "haifa", Label = "חיפה", Lat = 32.7940, Long = 34.9896, Tzid = "Asia/Jerusalem" },
        new() { Id = "beersheva", Label = "באר שבע", Lat = 31.2530, Long = 34.7915, Tzid = "Asia/Jerusalem" },
        new() { Id = "modiinilit", Label = "מודיעין עילית", Lat = 31.9333, Long = 35.0333, Tzid = "Asia/Jerusalem" },
        new() { Id = "newyork", Label = "ניו יורק", Lat = 40.7128, Long = -74.0060, Tzid = "America/New_York" },
        new() { Id = "lakewood", Label = "לייקווד", Lat = 40.0959, Long = -74.2101, Tzid = "America/New_York" },
        new() { Id = "london", Label = "לונדון", Lat = 51.5074, Long = -0.1278, Tzid = "Europe/London" },
        new() { Id = "manchester", Label = "מנצ'סטר", Lat = 53.4808, Long = -2.2426, Tzid = "Europe/London" },
        new() { Id = "antwerp", Label = "אנטוורפן", Lat = 51.2194, Long = 4.4025, Tzid = "Europe/Brussels" },
        new() { Id = "zurich", Label = "ציריך", Lat = 47.3769, Long = 8.5417, Tzid = "Europe/Zurich" },
        new() { Id = "vienna", Label = "וינה", Lat = 48.2082, Long = 16.3738, Tzid = "Europe/Vienna" },
        new() { Id = "montreal", Label = "מונטריאול", Lat = 45.5019, Long = -73.5674, Tzid = "America/Toronto" }
    ];

    private static readonly Dictionary<string, LocationDef> ById = Locations.ToDictionary(x => x.Id);

    public static LocationDef? LocationById(string id) => ById.GetValueOrDefault(id);

    private static double DegToRad(double angleDeg) => Math.PI * angleDeg / 180.0;
    private static double RadToDeg(double angleRad) => 180.0 * angleRad / Math.PI;

    private static double CalcTimeJulianCent(double jd) => (jd - 2451545.0) / 36525.0;

    private static double CalcGeomMeanLongSun(double t)
    {
        double l0 = 280.46646 + t * (36000.76983 + t * 0.0003032);
        while (l0 > 360.0) l0 -= 360.0;
        while (l0 < 0.0) l0 += 360.0;
        return l0;
    }

    private static double CalcGeomMeanAnomalySun(double t) => 357.52911 + t * (35999.05029 - 0.0001537 * t);
    private static double CalcEccentricityEarthOrbit(double t) => 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

    private static double CalcSunEqOfCenter(double t)
    {
        double m = CalcGeomMeanAnomalySun(t);
        double mrad = DegToRad(m);
        double sinm = Math.Sin(mrad);
        double sin2m = Math.Sin(2 * mrad);
        double sin3m = Math.Sin(3 * mrad);
        return sinm * (1.914602 - t * (0.004817 + 0.000014 * t)) + sin2m * (0.019993 - 0.000101 * t) + sin3m * 0.000289;
    }

    private static double CalcSunTrueLong(double t) => CalcGeomMeanLongSun(t) + CalcSunEqOfCenter(t);

    private static double CalcSunApparentLong(double t)
    {
        double o = CalcSunTrueLong(t);
        double omega = 125.04 - 1934.136 * t;
        return o - 0.00569 - 0.00478 * Math.Sin(DegToRad(omega));
    }

    private static double CalcMeanObliquityOfEcliptic(double t)
    {
        double seconds = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
        return 23.0 + (26.0 + seconds / 60.0) / 60.0;
    }

    private static double CalcObliquityCorrection(double t)
    {
        double e0 = CalcMeanObliquityOfEcliptic(t);
        double omega = 125.04 - 1934.136 * t;
        return e0 + 0.00256 * Math.Cos(DegToRad(omega));
    }

    private static double CalcSunDeclination(double t)
    {
        double e = CalcObliquityCorrection(t);
        double lambda = CalcSunApparentLong(t);
        double sint = Math.Sin(DegToRad(e)) * Math.Sin(DegToRad(lambda));
        return RadToDeg(Math.Asin(sint));
    }

    private static double CalcEquationOfTime(double t)
    {
        double epsilon = CalcObliquityCorrection(t);
        double l0 = CalcGeomMeanLongSun(t);
        double e = CalcEccentricityEarthOrbit(t);
        double m = CalcGeomMeanAnomalySun(t);
        double y = Math.Tan(DegToRad(epsilon) / 2.0);
        y *= y;
        double sin2l0 = Math.Sin(2.0 * DegToRad(l0));
        double sinm = Math.Sin(DegToRad(m));
        double cos2l0 = Math.Cos(2.0 * DegToRad(l0));
        double sin4l0 = Math.Sin(4.0 * DegToRad(l0));
        double sin2m = Math.Sin(2.0 * DegToRad(m));
        double etime = y * sin2l0 - 2.0 * e * sinm + 4.0 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m;
        return RadToDeg(etime) * 4.0;
    }

    private static double CalcHourAngle(double angle, double lat, double solarDec)
    {
        double latRad = DegToRad(lat);
        double sdRad = DegToRad(solarDec);
        double haArg = Math.Cos(DegToRad(90 + angle)) / (Math.Cos(latRad) * Math.Cos(sdRad)) - Math.Tan(latRad) * Math.Tan(sdRad);
        return Math.Acos(haArg);
    }

    private static double GetJD(DateTime date)
    {
        int year = date.Year;
        int month = date.Month;
        int day = date.Day;
        if (month < 3)
        {
            year--;
            month += 12;
        }
        int a = year / 100;
        int b = 2 - a + a / 4;
        return Math.Floor(365.25 * (year + 4716)) + Math.Floor(30.6001 * (month + 1)) + day + b - 1524.5;
    }

    private static double CalcSunriseSetUTC(bool rise, double angle, double jd, double latitude, double longitude)
    {
        double t = CalcTimeJulianCent(jd);
        double eqTime = CalcEquationOfTime(t);
        double solarDec = CalcSunDeclination(t);
        double hourAngle = CalcHourAngle(angle, latitude, solarDec);
        if (!rise) hourAngle = -hourAngle;
        double delta = longitude + RadToDeg(hourAngle);
        return 720 - 4.0 * delta - eqTime;
    }

    private static DateTime? CalcSunriseSet(bool rise, double angle, double jd, DateTime date, double latitude, double longitude)
    {
        try
        {
            double timeUTC = CalcSunriseSetUTC(rise, angle, jd, latitude, longitude);
            double newTimeUTC = CalcSunriseSetUTC(rise, angle, jd + timeUTC / 1440.0, latitude, longitude);
            if (double.IsNaN(newTimeUTC)) return null;

            int totalMinutes = (int)Math.Round(newTimeUTC);
            return new DateTime(date.Year, date.Month, date.Day, 0, 0, 0, DateTimeKind.Utc).AddMinutes(totalMinutes);
        }
        catch
        {
            return null;
        }
    }

    public static DateTime GregorianFromAbs(int abs)
    {
        return new DateTime(1, 1, 1).AddDays(abs - 1);
    }

    public static DayTimesResult? DayTimes(int abs, LocationDef? location)
    {
        if (location == null || double.IsNaN(location.Lat) || double.IsNaN(location.Long)) return null;

        var greg = GregorianFromAbs(abs);
        var prevGreg = greg.AddDays(-1);

        double jd = GetJD(greg);
        double prevJd = GetJD(prevGreg);

        var sunriseUtc = CalcSunriseSet(true, 0.833333, jd, greg, location.Lat, location.Long);
        var sunsetUtc = CalcSunriseSet(false, 0.833333, jd, greg, location.Lat, location.Long);
        var prevSunsetUtc = CalcSunriseSet(false, 0.833333, prevJd, prevGreg, location.Lat, location.Long);

        if (!sunriseUtc.HasValue || !sunsetUtc.HasValue || !prevSunsetUtc.HasValue) return null;

        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(location.Tzid);
        }
        catch
        {
            tz = TimeZoneInfo.Local;
        }

        string Format(DateTime utc)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(utc, tz);
            return local.ToString("HH:mm");
        }

        string daySunrise = Format(sunriseUtc.Value);
        string daySunset = Format(sunsetUtc.Value);
        string nightSunset = Format(prevSunsetUtc.Value);

        return new DayTimesResult
        {
            Day = (daySunrise, daySunset),
            Night = (nightSunset, daySunrise)
        };
    }

    /// <summary>Raw (UTC, precise DateTime) sunrise/sunset for day and night onot - unlike DayTimes, not rounded to "HH:mm" strings, for building exact Google Calendar event start/end times.</summary>
    public static DayTimesRawResult? DayTimesRaw(int abs, LocationDef? location)
    {
        if (location == null || double.IsNaN(location.Lat) || double.IsNaN(location.Long)) return null;

        var greg = GregorianFromAbs(abs);
        var prevGreg = greg.AddDays(-1);
        double jd = GetJD(greg);
        double prevJd = GetJD(prevGreg);

        var sunriseUtc = CalcSunriseSet(true, 0.833333, jd, greg, location.Lat, location.Long);
        var sunsetUtc = CalcSunriseSet(false, 0.833333, jd, greg, location.Lat, location.Long);
        var prevSunsetUtc = CalcSunriseSet(false, 0.833333, prevJd, prevGreg, location.Lat, location.Long);
        if (!sunriseUtc.HasValue || !sunsetUtc.HasValue || !prevSunsetUtc.HasValue) return null;

        return new DayTimesRawResult
        {
            Day = (sunriseUtc.Value, sunsetUtc.Value),
            Night = (prevSunsetUtc.Value, sunriseUtc.Value)
        };
    }

    /// <summary>Tzeit hakochavim (nightfall at the given depression angle, default 8.5deg) for the Gregorian day belonging to abs's own daytime sunset - matches how DayTimesRaw anchors Day.Sunset.</summary>
    public static DateTime? Tzeit(int abs, LocationDef? location, double angle = 8.5)
    {
        if (location == null || double.IsNaN(location.Lat) || double.IsNaN(location.Long)) return null;
        var greg = GregorianFromAbs(abs);
        double jd = GetJD(greg);
        return CalcSunriseSet(false, angle, jd, greg, location.Lat, location.Long);
    }

    public static string TimesLine(int abs, LocationDef? location)
    {
        var times = DayTimes(abs, location);
        if (times == null) return string.Empty;
        return $"עונת היום: {times.Day.Sunrise} - {times.Day.Sunset} | עונת הלילה: {times.Night.Sunset} - {times.Night.Sunrise}";
    }
}
