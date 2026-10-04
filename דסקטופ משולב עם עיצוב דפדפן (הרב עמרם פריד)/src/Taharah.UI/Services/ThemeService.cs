using System.Linq;
using System.Windows;
using System.Windows.Media;
using Wpf.Ui.Appearance;
using Wpf.Ui.Controls;

namespace Taharah.UI.Services;

public static class ThemeService
{
    public const string Light = "light";
    public const string Dark = "dark";

    public static void Apply(string theme)
    {
        var app = Application.Current;
        if (app == null)
        {
            return;
        }

        var dictUri = theme == Dark
            ? new System.Uri("Themes/DarkTheme.xaml", System.UriKind.Relative)
            : new System.Uri("Themes/LightTheme.xaml", System.UriKind.Relative);

        var newDict = new ResourceDictionary { Source = dictUri };
        var existing = app.Resources.MergedDictionaries
            .FirstOrDefault(d => d.Source != null && d.Source.OriginalString.Contains("Theme.xaml"));

        if (existing != null)
        {
            int idx = app.Resources.MergedDictionaries.IndexOf(existing);
            app.Resources.MergedDictionaries[idx] = newDict;
        }
        else
        {
            app.Resources.MergedDictionaries.Add(newDict);
        }

        // Keeps WPF-UI's own Fluent controls (FluentWindow's Mica backdrop, Card, Button,
        // ToggleSwitch, ...) in sync with the same light/dark choice as our own brushes above -
        // otherwise ui:* controls would stay stuck on whatever ThemesDictionary's initial
        // Theme="Light" in App.xaml set them to.
        var applicationTheme = theme == Dark ? ApplicationTheme.Dark : ApplicationTheme.Light;
        ApplicationThemeManager.Apply(applicationTheme, WindowBackdropType.Mica, updateAccent: true);

        // Wpf.Ui's own accent brushes (the Appearance="Primary" of a ui:Button, the active
        // segment of the month/year switcher, ui:ToggleSwitch, focus rings) come from the
        // Windows accent color - which has nothing to do with this app's palette. Without this
        // they rendered in the system blue while the rest of the window used the design's
        // indigo, so "דוח והדפסה" and the active tab disagreed with every other accent in the
        // app. Applying our own PrimaryBrush (the token the design files define, per theme) as
        // the Fluent accent keeps the whole window on one palette. Deliberately AFTER
        // ApplicationThemeManager.Apply(updateAccent: true) - that call resets the accent to
        // the system one and would otherwise overwrite this.
        if (newDict["PrimaryBrush"] is SolidColorBrush primaryAccent)
        {
            ApplicationAccentColorManager.Apply(primaryAccent.Color, applicationTheme);
        }
    }
}

