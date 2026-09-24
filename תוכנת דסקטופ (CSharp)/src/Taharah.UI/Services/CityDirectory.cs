namespace Taharah.UI.Services;

public record CityLocation(string Id, string Label, double Lat, double Long, string TzId);

public static class CityDirectory
{
    public static readonly IReadOnlyList<CityLocation> Locations = new List<CityLocation>
    {
        new("jerusalem", "ירושלים", 31.7683, 35.2137, "Asia/Jerusalem"),
        new("telaviv", "תל אביב", 32.0853, 34.7818, "Asia/Jerusalem"),
        new("bneibrak", "בני ברק", 32.0807, 34.8338, "Asia/Jerusalem"),
        new("beitshemesh", "בית שמש", 31.7487, 34.9880, "Asia/Jerusalem"),
        new("ashdod", "אשדוד", 31.8014, 34.6435, "Asia/Jerusalem"),
        new("haifa", "חיפה", 32.7940, 34.9896, "Asia/Jerusalem"),
        new("beersheva", "באר שבע", 31.2530, 34.7915, "Asia/Jerusalem"),
        new("modiinilit", "מודיעין עילית", 31.9333, 35.0333, "Asia/Jerusalem"),
        new("newyork", "ניו יורק", 40.7128, -74.0060, "America/New_York"),
        new("lakewood", "לייקווד", 40.0959, -74.2101, "America/New_York"),
        new("london", "לונדון", 51.5074, -0.1278, "Europe/London"),
        new("manchester", "מנצ'סטר", 53.4808, -2.2426, "Europe/London"),
        new("antwerp", "אנטוורפן", 51.2194, 4.4025, "Europe/Brussels"),
        new("zurich", "ציריך", 47.3769, 8.5417, "Europe/Zurich"),
        new("vienna", "וינה", 48.2082, 16.3738, "Europe/Vienna"),
        new("montreal", "מונטריאול", 45.5019, -73.5674, "America/Toronto"),
    };

    public static CityLocation? GetById(string? id) =>
        Locations.FirstOrDefault(l => string.Equals(l.Id, id, StringComparison.OrdinalIgnoreCase));
}
