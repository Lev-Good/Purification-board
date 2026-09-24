using System.Windows;
using System.Windows.Controls;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Views;

public partial class PinLockOverlayView : UserControl
{
    public PinLockOverlayView()
    {
        InitializeComponent();
    }

    private void OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm && sender is PasswordBox pb)
        {
            vm.PinInput = pb.Password;
        }
    }
}
