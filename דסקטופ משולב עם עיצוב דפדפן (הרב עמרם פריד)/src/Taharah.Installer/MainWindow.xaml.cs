using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows;
using Microsoft.Win32;

namespace Taharah.Installer;

public partial class MainWindow : Window
{
    private bool _isCompleted;
    private string _installedExePath = string.Empty;

    public MainWindow()
    {
        InitializeComponent();

        string defaultPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "Taharah");

        PathTextBox.Text = defaultPath;
    }

    private void BrowseButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog
        {
            Title = "בחירת תיקיית התקנה",
            InitialDirectory = PathTextBox.Text
        };

        if (dialog.ShowDialog() == true)
        {
            PathTextBox.Text = Path.Combine(dialog.FolderName, "Taharah");
        }
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void ActionButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isCompleted)
        {
            if (LaunchAfterCheckBox.IsChecked == true && File.Exists(_installedExePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _installedExePath,
                    WorkingDirectory = Path.GetDirectoryName(_installedExePath),
                    UseShellExecute = true
                });
            }
            Close();
            return;
        }

        string targetDir = PathTextBox.Text.Trim();
        if (string.IsNullOrEmpty(targetDir))
        {
            MessageBox.Show("נא לבחור תיקיית התקנה תקינה.", "שגיאה", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Disable controls during installation
        PathTextBox.IsEnabled = false;
        BrowseButton.IsEnabled = false;
        DesktopShortcutCheckBox.IsEnabled = false;
        StartMenuShortcutCheckBox.IsEnabled = false;
        LaunchAfterCheckBox.IsEnabled = false;
        ActionButton.IsEnabled = false;
        CancelButton.IsEnabled = false;

        try
        {
            await Task.Run(() => PerformInstall(targetDir));

            _isCompleted = true;
            SetupPanel.Visibility = Visibility.Collapsed;
            CompletePanel.Visibility = Visibility.Visible;
            ActionButton.Content = "סיום";
            ActionButton.IsEnabled = true;
            CancelButton.Visibility = Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"אירעה שגיאה במהלך ההתקנה:\n{ex.Message}", "שגיאה בהתקנה", MessageBoxButton.OK, MessageBoxImage.Error);
            ActionButton.IsEnabled = true;
            CancelButton.IsEnabled = true;
        }
    }

    private void PerformInstall(string targetDir)
    {
        UpdateStatus("יוצר תיקיות יעד...", 5);
        Directory.CreateDirectory(targetDir);

        var assembly = Assembly.GetExecutingAssembly();
        var resourceNames = assembly.GetManifestResourceNames();
        var zipResourceName = resourceNames.FirstOrDefault(n => n.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase));

        if (zipResourceName == null)
        {
            throw new FileNotFoundException("משאב ההתקנה (payload.zip) לא נמצא בקובץ ההתקנה.");
        }

        using var stream = assembly.GetManifestResourceStream(zipResourceName)!;
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        int total = archive.Entries.Count;
        int count = 0;

        foreach (var entry in archive.Entries)
        {
            count++;
            // Strip leading folder if entries are wrapped in root dir
            string relativePath = entry.FullName;
            int slashIndex = relativePath.IndexOfAny(['/', '\\']);
            if (slashIndex > 0)
            {
                relativePath = relativePath[(slashIndex + 1)..];
            }

            if (string.IsNullOrEmpty(relativePath)) continue;

            string destinationPath = Path.Combine(targetDir, relativePath);

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(destinationPath);
                continue;
            }

            string? dir = Path.GetDirectoryName(destinationPath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            entry.ExtractToFile(destinationPath, overwrite: true);

            int percent = 10 + (int)((count / (double)total) * 75);
            UpdateStatus($"מחלץ: {entry.Name}", percent);
        }

        _installedExePath = Path.Combine(targetDir, "Taharah.exe");

        // Shortcuts
        UpdateStatus("יוצר קיצורי דרך...", 90);

        Dispatcher.Invoke(() =>
        {
            if (DesktopShortcutCheckBox.IsChecked == true)
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string lnk = Path.Combine(desktop, "לוח טהרה (הרב עמרם פריד).lnk");
                CreateShortcut(lnk, _installedExePath, targetDir);
            }

            if (StartMenuShortcutCheckBox.IsChecked == true)
            {
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "לוח טהרה");
                Directory.CreateDirectory(startMenu);
                string lnk = Path.Combine(startMenu, "לוח טהרה (הרב עמרם פריד).lnk");
                CreateShortcut(lnk, _installedExePath, targetDir);
            }
        });

        // Uninstaller registration
        UpdateStatus("רושם תוכנה במערכת...", 95);
        RegisterUninstall(targetDir);

        UpdateStatus("ההתקנה הושלמה!", 100);
    }

    private void UpdateStatus(string message, int progress)
    {
        Dispatcher.Invoke(() =>
        {
            StatusTextBlock.Text = message;
            InstallProgressBar.Value = progress;
        });
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
    {
        try
        {
            Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.Description = "לוח טהרה — הרב עמרם פריד שליט״א";
                shortcut.IconLocation = targetPath + ",0";
                shortcut.Save();
            }
        }
        catch { }
    }

    private void RegisterUninstall(string targetDir)
    {
        try
        {
            // Create uninstall script
            string uninstallCmd = Path.Combine(targetDir, "uninstall.cmd");
            string cmdContent = $@"@echo off
taskkill /F /IM Taharah.exe >nul 2>&1
timeout /t 1 >nul
rmdir /s /q ""{targetDir}""
del /f /q ""{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)}\לוח טהרה (הרב עמרם פריד).lnk"" >nul 2>&1
rmdir /s /q ""{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "לוח טהרה")}"" >nul 2>&1
reg delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\TaharahApp"" /f >nul 2>&1
";
            File.WriteAllText(uninstallCmd, cmdContent);

            using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TaharahApp");
            if (key != null)
            {
                key.SetValue("DisplayName", "לוח טהרה (הרב עמרם פריד שליט״א)");
                key.SetValue("DisplayVersion", "3.4.1");
                key.SetValue("Publisher", "Lev Good");
                key.SetValue("DisplayIcon", _installedExePath);
                key.SetValue("InstallLocation", targetDir);
                key.SetValue("UninstallString", $"cmd.exe /c \"{uninstallCmd}\"");
            }
        }
        catch { }
    }
}
