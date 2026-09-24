using System;
using Wpf.Ui;
using Wpf.Ui.Controls;

namespace Taharah.UI.Services;

/// <summary>
/// Thin wrapper around WPF-UI's ISnackbarService (js/notifications.js's showToast, 87 call
/// sites in the JS app - the C# port had none until now). Initialize() is called once from
/// MainWindow after its SnackbarPresenter is in the visual tree; every other call site (save,
/// delete, sync...) just calls ShowSuccess/ShowInfo/ShowError without knowing whether a
/// presenter exists yet - safe no-op before Initialize() (e.g. in unit tests, which construct
/// ViewModels directly with no window at all).
/// </summary>
public static class NotificationService
{
    private static ISnackbarService? _service;

    public static void Initialize(ISnackbarService service) => _service = service;

    public static void ShowSuccess(string message, string title = "בוצע בהצלחה") =>
        Show(title, message, ControlAppearance.Success);

    public static void ShowInfo(string message, string title = "עדכון") =>
        Show(title, message, ControlAppearance.Info);

    public static void ShowError(string message, string title = "שגיאה") =>
        Show(title, message, ControlAppearance.Danger);

    private static void Show(string title, string message, ControlAppearance appearance)
    {
        try
        {
            _service?.Show(title, message, appearance, null, TimeSpan.FromSeconds(3));
        }
        catch
        {
            // Never let a notification failure (e.g. presenter torn down mid-shutdown) surface.
        }
    }
}
