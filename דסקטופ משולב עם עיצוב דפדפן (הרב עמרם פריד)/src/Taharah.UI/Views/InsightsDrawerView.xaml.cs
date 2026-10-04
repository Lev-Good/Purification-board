using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Views;

public partial class InsightsDrawerView : UserControl
{
    public InsightsDrawerView()
    {
        InitializeComponent();
    }

    private void OnCloseInsightsClicked(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.CloseInsights();
        }
    }
}
