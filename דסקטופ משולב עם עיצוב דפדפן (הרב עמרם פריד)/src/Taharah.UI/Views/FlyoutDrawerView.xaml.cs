using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.UI.Views;

public partial class FlyoutDrawerView : UserControl
{
    public FlyoutDrawerView()
    {
        InitializeComponent();
    }

    private void OnCloseDrawerClicked(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.CloseDrawer();
        }
    }

    private async void OnDeleteEntryClicked(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is CalendarDayEntry entry && DataContext is MainViewModel vm)
        {
            await vm.DeleteEntryAsync(entry);
        }
    }
}
