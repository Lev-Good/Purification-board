using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Taharah.Core.Models;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.UI.ViewModels;

public partial class CalendarDayViewModel : ObservableObject
{
    [ObservableProperty]
    private int _dayNumber;

    [ObservableProperty]
    private string _hebrewDayString = string.Empty;

    [ObservableProperty]
    private string _hebrewDateFormatted = string.Empty;

    [ObservableProperty]
    private DateTime _gregorianDate;

    [ObservableProperty]
    private int _absoluteDay;

    [ObservableProperty]
    private bool _isCurrentMonth = true;

    /// <summary>Leading blank cell so a mini-month grid's 1st day lands in its correct weekday column (Yearly Overview).</summary>
    [ObservableProperty]
    private bool _isPlaceholder;

    [ObservableProperty]
    private bool _isToday;

    [ObservableProperty]
    private bool _isSelected;

    [ObservableProperty]
    private string _sunrise = string.Empty;

    [ObservableProperty]
    private string _sunset = string.Empty;

    [ObservableProperty]
    private string _statusSummary = "טהורה";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsShevaNekiyimDay))]
    private int? _shevaNekiyimDayIndex;

    /// <summary>Display-only helper: the day falls inside the seven clean days. The engine reports the
    /// specific day index (1-7, or null outside the seven days); the calendar's tiles and the yearly
    /// mini-months need a single boolean to colour by, and a trigger on a nullable int cannot express
    /// "greater than zero". Carries no halachic meaning of its own.</summary>
    public bool IsShevaNekiyimDay => ShevaNekiyimDayIndex is > 0;

    [ObservableProperty]
    private bool _isMikvehNight;

    [ObservableProperty]
    private bool _isHefsekTaharah;

    [ObservableProperty]
    private bool _hasReiya;

    [ObservableProperty]
    private bool _hasCheck;

    [ObservableProperty]
    private string _notes = string.Empty;

    public ObservableCollection<DayBadgeViewModel> Badges { get; } = new();
    public ObservableCollection<CalendarDayEntry> Events { get; } = new();
    public ObservableCollection<PrishahEntry> ActiveOnot { get; } = new();
}
