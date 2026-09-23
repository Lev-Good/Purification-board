using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Navigation;

namespace Taharah.UI.Views;

public partial class AboutDrawerView : UserControl
{
    public AboutDrawerView()
    {
        InitializeComponent();
    }

    private void OnEmailLinkRequestNavigate(object sender, RequestNavigateEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch
        {
            // Best-effort - no mail client configured, or the shell call failed.
        }
        e.Handled = true;
    }
}
