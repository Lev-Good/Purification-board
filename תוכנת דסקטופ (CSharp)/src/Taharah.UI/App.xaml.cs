using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Threading;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.UI.Services;
using Taharah.UI.ViewModels;

namespace Taharah.UI;

public partial class App : Application
{
    private ErrorLogService? _errorLogService;

    // Two copies would fight over the local SQLite file and each run their own Google OAuth
    // token refresh / calendar sync - mirrors js/main.js's requestSingleInstanceLock +
    // 'second-instance' handler (which focuses the existing BrowserWindow instead of opening
    // a duplicate). Kept as an instance field, not a local variable, so the Mutex isn't
    // GC'd/released for as long as the app process is alive.
    private Mutex? _singleInstanceMutex;
    private const string SingleInstanceMutexName = "TaharahApp_SingleInstance_Mutex";
    private const string MainWindowTitle = "לוח טהרה — מערכת הלכתית מקצועית";
    private const int SW_RESTORE = 9;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string? lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _singleInstanceMutex = new Mutex(initiallyOwned: true, name: SingleInstanceMutexName, createdNew: out bool isFirstInstance);
        if (!isFirstInstance)
        {
            IntPtr existing = FindWindow(null, MainWindowTitle);
            if (existing != IntPtr.Zero)
            {
                if (IsIconic(existing))
                {
                    ShowWindow(existing, SW_RESTORE);
                }
                SetForegroundWindow(existing);
            }
            Shutdown();
            return;
        }

        // If Windows' regional settings use the Hebrew lunar calendar as the display
        // calendar for he-IL (Region settings -> Calendar -> "לוח עברי"), .NET's own
        // System.Globalization.HebrewCalendar becomes the culture's default Calendar -
        // and every implicit DateTime formatting call anywhere in WPF (day-cell bindings,
        // DatePicker controls, etc.) silently routes through it. That calendar has its own
        // narrow valid range and known bugs unrelated to this app's own Hebrew calendar
        // math (Taharah.Core.Calendar.HDate, a faithful port of hebcal - the sole source of
        // truth here), and throws ArgumentOutOfRangeException("ordinal", ...) on certain
        // dates (observed right at a Rosh Hashana boundary). The app must always format
        // Gregorian dates as Gregorian, exactly like js/app.js's plain JS Date - so the
        // culture's calendar is forced to Gregorian while keeping he-IL for everything else
        // (RTL, month/day names, number formatting).
        var culture = (System.Globalization.CultureInfo)System.Globalization.CultureInfo.GetCultureInfo("he-IL").Clone();
        culture.DateTimeFormat.Calendar = new System.Globalization.GregorianCalendar();
        System.Globalization.CultureInfo.DefaultThreadCurrentCulture = culture;
        System.Globalization.CultureInfo.DefaultThreadCurrentUICulture = culture;
        System.Threading.Thread.CurrentThread.CurrentCulture = culture;
        System.Threading.Thread.CurrentThread.CurrentUICulture = culture;
        FrameworkElement.LanguageProperty.OverrideMetadata(
            typeof(FrameworkElement),
            new FrameworkPropertyMetadata(System.Windows.Markup.XmlLanguage.GetLanguage(culture.IetfLanguageTag)));

        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
        TaskScheduler.UnobservedTaskException += TaskScheduler_UnobservedTaskException;

        string appDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
            "TaharahApp");
        
        Directory.CreateDirectory(appDataFolder);
        string dbPath = Path.Combine(appDataFolder, "taharah.db");

        var securityService = new SecurityService();
        var repository = new SqliteTaharahRepository(dbPath, securityService);
        await repository.InitializeAsync();

        _errorLogService = new ErrorLogService(repository);
        var googleOAuthService = new GoogleOAuthService(repository, securityService);

        var printService = new PrintService();

        string? savedTheme = await repository.GetSettingAsync("theme");
        string theme = savedTheme == ThemeService.Dark ? ThemeService.Dark : ThemeService.Light;
        ThemeService.Apply(theme);

        var mainVm = new MainViewModel(repository, securityService, printService, _errorLogService, googleOAuthService)
        {
            IsDarkTheme = theme == ThemeService.Dark
        };
        var mainWindow = new MainWindow(mainVm);

        mainWindow.Show();
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        _errorLogService?.LogErrorBlocking(e.Exception.Message, e.Exception.ToString());
        MessageBox.Show($"אירעה שגיאה בתוכנה: {e.Exception.Message}\n\nהתוכנה תמשיך לפעול כסדרה.", "שגיאה", MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            _errorLogService?.LogErrorBlocking(ex.Message, ex.ToString());
            MessageBox.Show($"אירעה שגיאה בלתי צפויה: {ex.Message}", "שגיאה", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void TaskScheduler_UnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        _errorLogService?.LogErrorBlocking("Unobserved task exception: " + e.Exception.Message, e.Exception.ToString());
        e.SetObserved();
    }
}


