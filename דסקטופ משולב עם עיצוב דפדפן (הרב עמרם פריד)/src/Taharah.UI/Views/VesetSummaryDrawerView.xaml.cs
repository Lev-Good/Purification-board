using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Views;

public partial class VesetSummaryDrawerView : UserControl
{
    public VesetSummaryDrawerView()
    {
        InitializeComponent();
    }

    private void OnCloseVesetSummaryClicked(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.CloseVesetSummary();
        }
    }
}
