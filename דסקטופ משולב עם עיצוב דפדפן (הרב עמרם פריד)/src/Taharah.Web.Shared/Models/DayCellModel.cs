using Taharah.Core.Calendar;
using Taharah.Core.Models;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Web.Shared.Models;

public sealed class BadgeModel
{
    public string Category { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string IconType { get; set; } = string.Empty;
    public string Tooltip { get; set; } = string.Empty;
    public string Ona { get; set; } = "day"; // "day" or "night"
    public bool IsUprooted { get; set; }
}

public sealed class DayCellModel
{
    public int Abs { get; set; }
    public HDate HDate { get; set; } = null!;
    public DateTime GregDate { get; set; }
    public string HebDayGematriya { get; set; } = string.Empty;
    public int GregDay { get; set; }
    public string SunsetTime { get; set; } = string.Empty;
    public string SunriseTime { get; set; } = string.Empty;
    public bool IsCurrentMonth { get; set; } = true;
    public bool IsToday { get; set; }
    public bool IsSelected { get; set; }
    
    public List<BadgeModel> NightBadges { get; set; } = [];
    public List<BadgeModel> DayBadges { get; set; } = [];
    
    public string StatusText { get; set; } = string.Empty;
    public CalendarDayEntry? SavedEntry { get; set; }
    public List<PrishahEntry> HalachicPrishot { get; set; } = [];
    
    // Quick flags
    public bool HasReiyah => SavedEntry?.Type == "reiyah";
    public bool HasHefsek => SavedEntry?.Type == "hefsek";
    public bool HasCheck => SavedEntry?.Type == "check";
    public bool HasTevilah => SavedEntry?.Type == "tevilah";
    public bool IsShevaNekiyimDay { get; set; }
    public int ShevaNekiyimDayNumber { get; set; }
    public bool IsMikvehNight { get; set; }
    public bool HasDayMark => SavedEntry?.Marks.Count > 0;
    public bool HasNote => !string.IsNullOrWhiteSpace(SavedEntry?.Note);
}
