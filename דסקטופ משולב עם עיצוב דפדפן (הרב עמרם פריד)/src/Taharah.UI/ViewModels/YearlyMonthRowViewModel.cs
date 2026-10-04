using System.Collections.ObjectModel;

namespace Taharah.UI.ViewModels;

/// <summary>One Hebrew month's worth of compact day cells, for the yearly overview (js/ui.js's buildYearlyRowHTML) - reuses CalendarDayViewModel so a day chip here opens the exact same drawer as the monthly grid.</summary>
public sealed class YearlyMonthRowViewModel
{
    public string MonthLabel { get; set; } = string.Empty;
    public ObservableCollection<CalendarDayViewModel> Days { get; } = new();
}
