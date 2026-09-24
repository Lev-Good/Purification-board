using CommunityToolkit.Mvvm.ComponentModel;

namespace Taharah.UI.ViewModels;

/// <summary>One pill-taking period (js/app.js's addPillPeriod) - "combined"|"mini"|"orgast"|"other" type, a start/end Gregorian date pair (null end = still taking them), and why she stopped ("own"|"doctor"|"other" - PillPauseManager's own rule reading).</summary>
public partial class PillPeriodViewModel : ObservableObject
{
    [ObservableProperty]
    private string _type = "combined";

    [ObservableProperty]
    private DateTime? _startDate;

    [ObservableProperty]
    private DateTime? _endDate;

    [ObservableProperty]
    private string _reason = "own";
}
