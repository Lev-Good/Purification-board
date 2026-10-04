using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Views;

public partial class SettingsDrawerView : UserControl
{
    public SettingsDrawerView()
    {
        InitializeComponent();
    }

    private async void OnCloseSettingsClicked(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            await vm.CloseSettingsAsync();
        }
    }

    private void OnRemovePillPeriodClicked(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is PillPeriodViewModel period && DataContext is MainViewModel vm)
        {
            vm.SettingsVm.RemovePillPeriod(period);
        }
    }
}
