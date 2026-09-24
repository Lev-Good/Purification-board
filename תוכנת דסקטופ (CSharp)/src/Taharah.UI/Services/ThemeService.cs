using System.Linq;
using System.Windows;
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
        ApplicationThemeManager.Apply(
            theme == Dark ? ApplicationTheme.Dark : ApplicationTheme.Light,
            WindowBackdropType.Mica,
            updateAccent: true);
    }
}

