using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace Taharah.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
        TaskScheduler.UnobservedTaskException += TaskScheduler_UnobservedTaskException;
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "desktop_crash.log");
        File.WriteAllText(logPath, e.Exception.ToString());
        MessageBox.Show($"שגיאה: {e.Exception.Message}\n\n{e.Exception}", "שגיאה בפתיחת לוח טהרה", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "desktop_crash.log");
        File.WriteAllText(logPath, e.ExceptionObject.ToString());
        MessageBox.Show($"שגיאה בלתי צפויה: {e.ExceptionObject}", "שגיאה בפתיחת לוח טהרה", MessageBoxButton.OK, MessageBoxImage.Error);
    }

    private void TaskScheduler_UnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "desktop_crash.log");
        File.WriteAllText(logPath, e.Exception.ToString());
        e.SetObserved();
    }
}
