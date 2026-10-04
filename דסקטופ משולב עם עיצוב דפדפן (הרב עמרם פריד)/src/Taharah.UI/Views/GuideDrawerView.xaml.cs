using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Views;

public partial class GuideDrawerView : UserControl
{
    public GuideDrawerView()
    {
        InitializeComponent();
    }

    private void OnCloseGuideClicked(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.CloseGuide();
        }
    }
}
