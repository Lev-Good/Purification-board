using System.Collections.ObjectModel;
using System.Text.Json;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.UI.Services;

namespace Taharah.UI.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ITaharahRepository _repository;
    private readonly ISecurityService _securityService;
    private readonly ErrorLogService? _errorLogService;
    private readonly Taharah.Infrastructure.Backup.GoogleOAuthService? _googleOAuthService;
    private readonly Taharah.Infrastructure.Backup.GoogleSheetsService? _googleSheetsService;
    private readonly UpdateCheckerService _updateChecker = new();

    public event Func<Task>? RequestRefreshCalendar;

    /// <summary>Raised by SyncCalendarNowCommand - MainViewModel (which holds the live events/engine state) handles the actual sync and returns its result.</summary>
    public event Func<Task<Taharah.Infrastructure.Backup.CalendarSyncResult>>? RequestCalendarSync;

    /// <summary>Raised by ClearCalendarEventsCommand - returns how many events were deleted.</summary>
    public event Func<Task<int>>? RequestClearCalendarEvents;

    /// <summary>Raised by SendEmailExportCommand - MainViewModel builds the payload from its live events/engine state and sends it.</summary>
    public event Func<string, string, bool, bool, bool, Task<Taharah.Infrastructure.Backup.EmailExportResult>>? RequestEmailExport;

    // --- Life state (js/app.js's life-state settings group / js/lifeState.js) ---

    [ObservableProperty]
    private bool _lifeEnabled;

    [ObservableProperty]
    private DateTime? _lifePregnancyDate;

    [ObservableProperty]
    private DateTime? _lifeBirthDate;

    [ObservableProperty]
    private bool _lifeNursing;

    [ObservableProperty]
    private bool _lifeNursingLenient;

    [ObservableProperty]
    private int? _lifeAgeYears;

    public ObservableCollection<PillPeriodViewModel> LifePillPeriods { get; } = new();

    public IReadOnlyList<CalendarDiscretionOption> PillTypeOptions { get; } =
    [
        new("combined", "כדורים משולבים"),
        new("mini", "מיני - פרוגסטרון בלבד"),
        new("orgast", "אורגסט - תלוי בסדר הנטילה"),
        new("other", "אחר")
    ];

    public IReadOnlyList<CalendarDiscretionOption> PillStopReasonOptions { get; } =
    [
        new("own", "הפסקתי מדעתי ומרצוני"),
        new("doctor", "הפסקתי בהוראת רופא"),
        new("other", "הפסקתי מחמת סיבה אחרת")
    ];

    /// <summary>A derived summary code ("pregnant"|"nursing"|"pills"|"normal") - PrintService.CreateMonthReport still switches on this for the printed report header; the actual engine input is built from the detailed fields above (MainViewModel.RefreshCalendarAsync).</summary>
    public string LifeState
    {
        get
        {
            if (!LifeEnabled) return "normal";
            if (LifePregnancyDate.HasValue) return "pregnant";
            if (LifeNursing) return "nursing";
            if (LifePillPeriods.Any(p => !p.EndDate.HasValue)) return "pills";
            return "normal";
        }
    }

    [ObservableProperty]
    private string _selectedCityId = "jerusalem";

    /// <summary>The global Or Zarua custom on/off - separate from, and a prerequisite for, the orZaruaDay31 stringency below.</summary>
    [ObservableProperty]
    private bool _orZarua = true;

    [ObservableProperty]
    private bool _showFertility = true;

    /// <summary>11-16 days (docs/SPEC_FERTILITY_INSIGHTS.md) - "for women who tracked ovulation medically and know their own luteal-phase length precisely".</summary>
    [ObservableProperty]
    private int _fertilityLutealPhaseDays = Taharah.Core.Algorithms.FertilityInsightsManager.DefaultLutealPhaseDays;

    /// <summary>"auto" = average of recent haflagot (default) | "manual" = a fixed cycle length the user enters herself.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsCycleBasisAuto))]
    [NotifyPropertyChangedFor(nameof(IsCycleBasisManual))]
    private string _fertilityCycleBasis = "auto";

    public bool IsCycleBasisAuto
    {
        get => FertilityCycleBasis == "auto";
        set { if (value) FertilityCycleBasis = "auto"; }
    }
    public bool IsCycleBasisManual
    {
        get => FertilityCycleBasis == "manual";
        set { if (value) FertilityCycleBasis = "manual"; }
    }

    [ObservableProperty]
    private int _fertilityManualCycleDays = Taharah.Core.Algorithms.FertilityInsightsManager.DefaultCycleLengthDays;

    /// <summary>Whether to surface the "ovulation before immersion" halachic-infertility banner - on by default once fertility tracking itself is enabled.</summary>
    [ObservableProperty]
    private bool _fertilityOvulationConflictAlert = true;

    public IReadOnlyList<CalendarDiscretionOption> FertilityCycleBasisOptions { get; } =
    [
        new("auto", "חישוב אוטומטי לפי ממוצע ההפלגות האחרונות"),
        new("manual", "אורך מחזור קבוע ידני")
    ];

    // --- The 13 halachic stringency switches (Taharah.Core.Algorithms.Stringencies) ---
    // Every disputed din the book presents with two positions. The app's default is the
    // simpler/lenient side; each stringency here is an explicit, conscious opt-in.

    [ObservableProperty]
    private bool _safekOnaBoth;

    [ObservableProperty]
    private bool _dilug;

    [ObservableProperty]
    private bool _checkUprootNonFixed;

    [ObservableProperty]
    private bool _orZaruaDay31 = true;

    [ObservableProperty]
    private bool _lateBedika = true;

    [ObservableProperty]
    private bool _haflagahFromEnd;

    [ObservableProperty]
    private bool _frightBedika;

    [ObservableProperty]
    private bool _stainUproots;

    [ObservableProperty]
    private bool _chiburLemafrea;

    [ObservableProperty]
    private bool _vesetHagufBedika = true;

    [ObservableProperty]
    private bool _karetiUfaletei;

    [ObservableProperty]
    private bool _vesetFromBedika;

    [ObservableProperty]
    private bool _sharpFoodOnes;

    [ObservableProperty]
    private bool _mevuchaDays = true;

    [ObservableProperty]
    private bool _hasPin;

    [ObservableProperty]
    private string _newPin = string.Empty;

    [ObservableProperty]
    private string _confirmPin = string.Empty;

    [ObservableProperty]
    private string _pinStatusMessage = string.Empty;

    [ObservableProperty]
    private string _sheetId = string.Empty;

    [ObservableProperty]
    private string _syncStatusMessage = string.Empty;

    [ObservableProperty]
    private string _updateStatusMessage = string.Empty;

    [ObservableProperty]
    private string _currentVersionDisplay = string.Empty;

    [ObservableProperty]
    private string _latestReleaseUrl = string.Empty;

    public IReadOnlyList<LocationDef> AvailableCities => ZmanimManager.Locations;
    public IReadOnlyList<StringencyDef> StringencyDefs => Stringencies.Defs;

    [ObservableProperty]
    private int _errorLogCount;

    [ObservableProperty]
    private bool _googleConnected;

    [ObservableProperty]
    private string _googleEmail = string.Empty;

    [ObservableProperty]
    private string _googleStatusMessage = string.Empty;

    /// <summary>Written into every Google Sheets backup row and offered back on restore - lets a future "forgot PIN" recovery reach the right person, mirroring js/security.js's recovery email (though this port has no way to actually send to it without the original author's Apps Script - see MIGRATION_PROGRESS.md).</summary>
    [ObservableProperty]
    private string _recoveryEmail = string.Empty;

    [ObservableProperty]
    private string _googleBackupStatusMessage = string.Empty;

    // --- Google Calendar sync settings (docs/GOOGLE_CALENDAR_SPEC.md sec.8) ---

    [ObservableProperty]
    private bool _calendarSyncEnabled;

    [ObservableProperty]
    private string _calendarDiscretion = "subtle"; // "detailed" | "subtle" | "discreet"

    [ObservableProperty]
    private string _calendarDiscreetPrefix = string.Empty;

    [ObservableProperty]
    private bool _calendarNotifyEmail = true;

    [ObservableProperty]
    private bool _calendarNotifyPopup = true;

    [ObservableProperty]
    private string _calendarMorningTime = "08:30";

    [ObservableProperty]
    private int _calendarSunsetLeadMinutes = 120;

    [ObservableProperty]
    private int _calendarHefsekAdvisoryDays = 5;

    [ObservableProperty]
    private bool _calendarMochDachukEnabled;

    [ObservableProperty]
    private bool _calendarHasScope;

    [ObservableProperty]
    private string _calendarLastSyncMessage = string.Empty;

    [ObservableProperty]
    private string _calendarStatusMessage = string.Empty;

    // --- Email data export (js/app.js's export-email modal, ported as an inline card - ---
    // --- this WPF app deliberately has no popup/modal system, see docs section 4). ---

    [ObservableProperty]
    private string _exportEmail = string.Empty;

    [ObservableProperty]
    private string _exportNotes = string.Empty;

    [ObservableProperty]
    private bool _exportIncludeFuture = true;

    [ObservableProperty]
    private bool _exportIncludeHistory = true;

    [ObservableProperty]
    private bool _exportIncludeNotes = true;

    [ObservableProperty]
    private string _exportStatusMessage = string.Empty;

    // --- Delete all data (js/app.js's executeDeleteAll) - arm/confirm pattern instead of a ---
    // --- modal dialog, since this app deliberately has no popup/modal system. ---

    [ObservableProperty]
    private bool _deleteAllArmed;

    [ObservableProperty]
    private string _deleteAllStatusMessage = string.Empty;

    public IReadOnlyList<CalendarDiscretionOption> CalendarDiscretionOptions { get; } =
    [
        new("detailed", "מפורט"),
        new("subtle", "סולידי (מומלץ)"),
        new("discreet", "מוצפן / שמות קוד")
    ];

    public SettingsViewModel(
        ITaharahRepository repository,
        ISecurityService securityService,
        ErrorLogService? errorLogService = null,
        Taharah.Infrastructure.Backup.GoogleOAuthService? googleOAuthService = null)
    {
        _repository = repository;
        _securityService = securityService;
        _errorLogService = errorLogService;
        _googleOAuthService = googleOAuthService;
        _googleSheetsService = googleOAuthService != null ? new Taharah.Infrastructure.Backup.GoogleSheetsService(googleOAuthService) : null;
        CurrentVersionDisplay = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";
    }

    /// <summary>Builds the live dictionary VesetEngine.CalculateEngine expects (EngineOptions.Stringencies).</summary>
    public Dictionary<string, bool> BuildStringenciesDict() => new()
    {
        ["safekOnaBoth"] = SafekOnaBoth,
        ["dilug"] = Dilug,
        ["checkUprootNonFixed"] = CheckUprootNonFixed,
        ["orZaruaDay31"] = OrZaruaDay31,
        ["lateBedika"] = LateBedika,
        ["haflagahFromEnd"] = HaflagahFromEnd,
        ["frightBedika"] = FrightBedika,
        ["stainUproots"] = StainUproots,
        ["chiburLemafrea"] = ChiburLemafrea,
        ["vesetHagufBedika"] = VesetHagufBedika,
        ["karetiUfaletei"] = KaretiUfaletei,
        ["vesetFromBedika"] = VesetFromBedika,
        ["sharpFoodOnes"] = SharpFoodOnes,
        ["mevuchaDays"] = MevuchaDays
    };

    /// <summary>Builds the settings object GoogleCalendarManager.BuildExpectedEvents expects.</summary>
    public Taharah.Core.Algorithms.CalendarSyncSettings BuildCalendarSyncSettings() => new()
    {
        Discretion = CalendarDiscretion,
        DiscreetPrefix = CalendarDiscreetPrefix,
        NotifyEmail = CalendarNotifyEmail,
        NotifyPopup = CalendarNotifyPopup,
        MorningTime = CalendarMorningTime,
        SunsetLeadMinutes = CalendarSunsetLeadMinutes,
        HefsekAdvisoryDays = CalendarHefsekAdvisoryDays,
        MochDachukEnabled = CalendarMochDachukEnabled
    };

    private void ApplyCalendarSyncSettings(Taharah.Core.Algorithms.CalendarSyncSettings settings)
    {
        CalendarDiscretion = settings.Discretion;
        CalendarDiscreetPrefix = settings.DiscreetPrefix;
        CalendarNotifyEmail = settings.NotifyEmail;
        CalendarNotifyPopup = settings.NotifyPopup;
        CalendarMorningTime = settings.MorningTime;
        CalendarSunsetLeadMinutes = settings.SunsetLeadMinutes;
        CalendarHefsekAdvisoryDays = settings.HefsekAdvisoryDays;
        CalendarMochDachukEnabled = settings.MochDachukEnabled;
    }

    // --- Minhag profile (Ashkenaz / Sephardi) - js/stringencies.js's MINHAG_PROFILES ---

    public IReadOnlyList<CalendarDiscretionOption> MinhagProfileOptions { get; } =
    [
        new("ashkenaz", "אשכנז"),
        new("sepharad", "עדות מזרח"),
        new("custom", "מותאם אישית")
    ];

    public string MinhagProfile
    {
        get
        {
            if (OrZarua && OrZaruaDay31 && KaretiUfaletei && VesetHagufBedika && MevuchaDays) return "ashkenaz";
            if (!OrZarua && !OrZaruaDay31 && !KaretiUfaletei && !VesetHagufBedika && !MevuchaDays) return "sepharad";
            return "custom";
        }
        set
        {
            if (value == "ashkenaz")
            {
                OrZarua = true;
                OrZaruaDay31 = true;
                KaretiUfaletei = true;
                VesetHagufBedika = true;
                MevuchaDays = true;
            }
            else if (value == "sepharad")
            {
                OrZarua = false;
                OrZaruaDay31 = false;
                KaretiUfaletei = false;
                VesetHagufBedika = false;
                MevuchaDays = false;
            }
            // "custom" is never set explicitly - it is only ever read back once one of the
            // five switches no longer matches a full profile.
            OnPropertyChanged();
        }
    }

    partial void OnOrZaruaChanged(bool value) => OnPropertyChanged(nameof(MinhagProfile));
    partial void OnOrZaruaDay31Changed(bool value) => OnPropertyChanged(nameof(MinhagProfile));
    partial void OnKaretiUfaleteiChanged(bool value) => OnPropertyChanged(nameof(MinhagProfile));
    partial void OnVesetHagufBedikaChanged(bool value) => OnPropertyChanged(nameof(MinhagProfile));
    partial void OnMevuchaDaysChanged(bool value) => OnPropertyChanged(nameof(MinhagProfile));

    private void ApplyStringenciesDict(Dictionary<string, bool> raw)
    {
        var normalized = Taharah.Core.Algorithms.Stringencies.Normalize(raw);
        SafekOnaBoth = normalized["safekOnaBoth"];
        Dilug = normalized["dilug"];
        CheckUprootNonFixed = normalized["checkUprootNonFixed"];
        OrZaruaDay31 = normalized["orZaruaDay31"];
        LateBedika = normalized["lateBedika"];
        HaflagahFromEnd = normalized["haflagahFromEnd"];
        FrightBedika = normalized["frightBedika"];
        StainUproots = normalized["stainUproots"];
        ChiburLemafrea = normalized["chiburLemafrea"];
        VesetHagufBedika = normalized["vesetHagufBedika"];
        KaretiUfaletei = normalized["karetiUfaletei"];
        VesetFromBedika = normalized["vesetFromBedika"];
        SharpFoodOnes = normalized["sharpFoodOnes"];
        MevuchaDays = normalized["mevuchaDays"];
    }

    public async Task LoadSettingsAsync()
    {
        SelectedCityId = await _repository.GetSettingAsync("location_city") ?? "jerusalem";

        string? lifeJson = await _repository.GetSettingAsync("life_state_json");
        LifePillPeriods.Clear();
        if (!string.IsNullOrEmpty(lifeJson))
        {
            try
            {
                var dto = JsonSerializer.Deserialize<LifeStateDto>(lifeJson);
                if (dto != null)
                {
                    LifeEnabled = dto.Enabled;
                    LifePregnancyDate = dto.PregnancyDate;
                    LifeBirthDate = dto.BirthDate;
                    LifeNursing = dto.Nursing;
                    LifeNursingLenient = dto.NursingLenient;
                    LifeAgeYears = dto.AgeYears;
                    foreach (var p in dto.Pills)
                    {
                        LifePillPeriods.Add(new PillPeriodViewModel
                        {
                            Type = p.Type,
                            StartDate = p.StartDate,
                            EndDate = p.EndDate,
                            Reason = p.Reason
                        });
                    }
                }
            }
            catch { /* corrupt/old settings blob - keep defaults */ }
        }

        string? orZaruaStr = await _repository.GetSettingAsync("or_zarua_enabled");
        OrZarua = orZaruaStr == null || bool.Parse(orZaruaStr);

        string? fertStr = await _repository.GetSettingAsync("show_fertility");
        ShowFertility = fertStr == null || bool.Parse(fertStr);

        string? lutealStr = await _repository.GetSettingAsync("fertility_luteal_phase_days");
        FertilityLutealPhaseDays = int.TryParse(lutealStr, out var lutealVal) ? Math.Clamp(lutealVal, 11, 16) : Taharah.Core.Algorithms.FertilityInsightsManager.DefaultLutealPhaseDays;

        FertilityCycleBasis = await _repository.GetSettingAsync("fertility_cycle_basis") ?? "auto";

        string? manualCycleStr = await _repository.GetSettingAsync("fertility_manual_cycle_days");
        FertilityManualCycleDays = int.TryParse(manualCycleStr, out var manualVal) ? manualVal : Taharah.Core.Algorithms.FertilityInsightsManager.DefaultCycleLengthDays;

        string? ovulationAlertStr = await _repository.GetSettingAsync("fertility_ovulation_conflict_alert");
        FertilityOvulationConflictAlert = ovulationAlertStr == null || bool.Parse(ovulationAlertStr);

        string? stringenciesJson = await _repository.GetSettingAsync("stringencies_json");
        Dictionary<string, bool>? raw = null;
        if (!string.IsNullOrEmpty(stringenciesJson))
        {
            try { raw = JsonSerializer.Deserialize<Dictionary<string, bool>>(stringenciesJson); }
            catch { raw = null; }
        }
        ApplyStringenciesDict(raw ?? []);

        var pinHash = await _repository.GetSettingAsync("pin_hash");
        HasPin = !string.IsNullOrEmpty(pinHash);

        SheetId = await _repository.GetSettingAsync("google_sheet_id") ?? string.Empty;
        ExportEmail = await _repository.GetSettingAsync("export_email") ?? string.Empty;

        if (_errorLogService != null)
        {
            ErrorLogCount = await _errorLogService.GetErrorLogCountAsync();
        }

        string? calendarSyncJson = await _repository.GetSettingAsync("calendar_sync_json");
        if (!string.IsNullOrEmpty(calendarSyncJson))
        {
            try
            {
                var settings = JsonSerializer.Deserialize<Taharah.Core.Algorithms.CalendarSyncSettings>(calendarSyncJson);
                if (settings != null) ApplyCalendarSyncSettings(settings);
            }
            catch { /* corrupt/old settings blob - keep defaults */ }
        }
        string? calendarSyncEnabledStr = await _repository.GetSettingAsync("calendar_sync_enabled");
        CalendarSyncEnabled = calendarSyncEnabledStr != null && bool.Parse(calendarSyncEnabledStr);

        RecoveryEmail = await _repository.GetSettingAsync("recovery_email") ?? string.Empty;

        if (_googleOAuthService != null)
        {
            var status = await _googleOAuthService.GetStatusAsync();
            GoogleConnected = status.Connected;
            GoogleEmail = status.Email;
            if (string.IsNullOrEmpty(SheetId) && !string.IsNullOrEmpty(status.SheetId))
            {
                SheetId = status.SheetId;
            }

            CalendarHasScope = Taharah.Core.Algorithms.GoogleCalendarManager.HasCalendarScope(status.GrantedScopes);
            CalendarLastSyncMessage = string.IsNullOrEmpty(status.CalendarLastSyncAt)
                ? "טרם בוצע סנכרון"
                : $"סנכרון אחרון: {status.CalendarLastSyncAt}";
        }
    }

    [RelayCommand]
    public async Task SaveSettingsAsync()
    {
        await _repository.SaveSettingAsync("location_city", SelectedCityId);

        var lifeDto = new LifeStateDto
        {
            Enabled = LifeEnabled,
            PregnancyDate = LifePregnancyDate,
            BirthDate = LifeBirthDate,
            Nursing = LifeNursing,
            NursingLenient = LifeNursingLenient,
            AgeYears = LifeAgeYears,
            Pills = LifePillPeriods.Select(p => new PillPeriodDto
            {
                Type = p.Type,
                StartDate = p.StartDate,
                EndDate = p.EndDate,
                Reason = p.Reason
            }).ToList()
        };
        await _repository.SaveSettingAsync("life_state_json", JsonSerializer.Serialize(lifeDto));
        await _repository.SaveSettingAsync("or_zarua_enabled", OrZarua.ToString());
        await _repository.SaveSettingAsync("show_fertility", ShowFertility.ToString());
        await _repository.SaveSettingAsync("fertility_luteal_phase_days", FertilityLutealPhaseDays.ToString());
        await _repository.SaveSettingAsync("fertility_cycle_basis", FertilityCycleBasis);
        await _repository.SaveSettingAsync("fertility_manual_cycle_days", FertilityManualCycleDays.ToString());
        await _repository.SaveSettingAsync("fertility_ovulation_conflict_alert", FertilityOvulationConflictAlert.ToString());
        await _repository.SaveSettingAsync("stringencies_json", JsonSerializer.Serialize(BuildStringenciesDict()));

        if (!string.IsNullOrWhiteSpace(SheetId))
        {
            await _repository.SaveSettingAsync("google_sheet_id", SheetId.Trim());
        }

        await _repository.SaveSettingAsync("calendar_sync_enabled", CalendarSyncEnabled.ToString());
        await _repository.SaveSettingAsync("calendar_sync_json", JsonSerializer.Serialize(BuildCalendarSyncSettings()));

        SyncStatusMessage = "ההגדרות נשמרו בהצלחה!";
    }

    [RelayCommand]
    public async Task ExportJsonBackupAsync()
    {
        var sfd = new SaveFileDialog
        {
            Title = "ייצוא גיבוי מקומי",
            Filter = "קובץ גיבוי JSON (*.json)|*.json",
            FileName = $"taharah_backup_{DateTime.Today:yyyyMMdd}.json"
        };

        if (sfd.ShowDialog() == true)
        {
            await JsonBackupManager.ExportDatabaseToFileAsync(_repository, sfd.FileName);
            SyncStatusMessage = $"הגיבוי יוצא בהצלחה לנתיב: {System.IO.Path.GetFileName(sfd.FileName)}";
        }
    }

    [RelayCommand]
    public async Task RestoreJsonBackupAsync()
    {
        var ofd = new OpenFileDialog
        {
            Title = "שחזור גיבוי מקומי",
            Filter = "קובץ גיבוי JSON (*.json)|*.json"
        };

        if (ofd.ShowDialog() == true)
        {
            var (count, success, err) = await JsonBackupManager.RestoreDatabaseFromFileAsync(_repository, ofd.FileName);
            if (success)
            {
                SyncStatusMessage = $"שוחזרו בהצלחה {count} רשומות מקובץ הגיבוי!";
                if (RequestRefreshCalendar != null)
                {
                    await RequestRefreshCalendar();
                }
            }
            else
            {
                SyncStatusMessage = $"שגיאה בשחזור: {err}";
            }
        }
    }

    [RelayCommand]
    public async Task CheckUpdatesAsync()
    {
        UpdateStatusMessage = "בודק עדכונים ב-GitHub...";
        LatestReleaseUrl = string.Empty;
        var res = await _updateChecker.CheckForUpdatesAsync();

        if (res.IsUpdateAvailable)
        {
            UpdateStatusMessage = $"גרסה חדשה זמינה: v{res.LatestVersion} (הגרסה הנוכחית: v{res.CurrentVersion})";
            LatestReleaseUrl = res.ReleaseUrl;
        }
        else
        {
            UpdateStatusMessage = $"התוכנה מעודכנת לגרסה האחרונה (v{res.CurrentVersion})";
        }
    }

    [RelayCommand]
    public void OpenReleaseUrl()
    {
        if (string.IsNullOrWhiteSpace(LatestReleaseUrl)) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(LatestReleaseUrl) { UseShellExecute = true });
        }
        catch
        {
            UpdateStatusMessage = "לא ניתן לפתוח את הדפדפן.";
        }
    }

    [RelayCommand]
    public async Task UpdatePinAsync()
    {
        if (string.IsNullOrWhiteSpace(NewPin))
        {
            PinStatusMessage = "אנא הזיני קוד PIN בן 4-6 ספרות.";
            return;
        }

        if (NewPin != ConfirmPin)
        {
            PinStatusMessage = "הקודים אינם תואמים.";
            return;
        }

        bool wasAlreadySet = HasPin;
        string hash = _securityService.HashPin(NewPin.Trim());
        await _repository.SaveSettingAsync("pin_hash", hash);

        // First time a PIN is set: migrate the (until now plaintext) events into an
        // encrypted blob keyed by it. Changing an existing PIN: re-encrypt under the new
        // key - the session is already unlocked, so the in-memory events are available.
        if (wasAlreadySet)
        {
            await _repository.RekeyDatabaseAsync(NewPin.Trim());
        }
        else
        {
            await _repository.UnlockDatabaseAsync(NewPin.Trim());
        }

        HasPin = true;
        NewPin = string.Empty;
        ConfirmPin = string.Empty;
        PinStatusMessage = "קוד PIN הוגדר בהצלחה!";
    }

    [RelayCommand]
    public async Task RemovePinAsync()
    {
        // Decrypts the in-memory events back into the plaintext table before dropping the
        // key - "no PIN" must mean the same thing here as it does when a PIN was never set,
        // not silently-undecryptable data.
        await _repository.RemoveDatabaseEncryptionAsync();
        await _repository.DeleteSettingAsync("pin_hash");
        HasPin = false;
        NewPin = string.Empty;
        ConfirmPin = string.Empty;
        PinStatusMessage = "נעילת PIN בוטלה.";
    }

    [RelayCommand]
    public async Task ExportErrorLogAsync()
    {
        if (_errorLogService == null)
        {
            SyncStatusMessage = "לוג התקלות אינו זמין.";
            return;
        }

        string version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";
        string text = await _errorLogService.BuildExportTextAsync(version);

        var sfd = new SaveFileDialog
        {
            Title = "ייצוא יומן תקלות",
            Filter = "קובץ טקסט (*.txt)|*.txt",
            FileName = $"taharah-error-log-{DateTime.Today:yyyy-MM-dd}.txt"
        };

        if (sfd.ShowDialog() == true)
        {
            await System.IO.File.WriteAllTextAsync(sfd.FileName, text, System.Text.Encoding.UTF8);
            SyncStatusMessage = $"יומן התקלות יוצא בהצלחה לנתיב: {System.IO.Path.GetFileName(sfd.FileName)}";
        }
    }

    [RelayCommand]
    public async Task ClearErrorLogAsync()
    {
        if (_errorLogService == null) return;
        await _errorLogService.ClearErrorLogAsync();
        ErrorLogCount = 0;
        SyncStatusMessage = "יומן התקלות נוקה.";
    }

    [RelayCommand]
    public async Task ConnectGoogleAsync()
    {
        if (_googleOAuthService == null)
        {
            GoogleStatusMessage = "החיבור לגוגל אינו זמין בגרסה זו.";
            return;
        }

        if (!Taharah.Infrastructure.Backup.GoogleOAuthService.HasLocalClientSecret())
        {
            GoogleStatusMessage = "לא ניתן להתחבר: חסר קובץ אישורי Google (google-oauth.local.json) ליד קובץ ההרצה של התוכנה. יש להגדיר בו מפתח סודי (client secret) מ-Google Cloud Console כדי להפעיל גיבוי/סנכרון לגוגל.";
            return;
        }

        GoogleStatusMessage = "נפתח חלון ההתחברות של גוגל בדפדפן...";
        try
        {
            var status = await _googleOAuthService.ConnectAsync();
            GoogleConnected = status.Connected;
            GoogleEmail = status.Email;
            GoogleStatusMessage = status.Connected
                ? $"התחברות הושלמה בהצלחה{(string.IsNullOrEmpty(status.Email) ? "" : " לחשבון " + status.Email)}."
                : "ההתחברות לא הושלמה.";
        }
        catch (Exception ex)
        {
            GoogleStatusMessage = $"ההתחברות נכשלה: {ex.Message}";
        }
    }

    [RelayCommand]
    public async Task DisconnectGoogleAsync()
    {
        if (_googleOAuthService == null) return;

        await _googleOAuthService.DisconnectAsync();
        GoogleConnected = false;
        GoogleEmail = string.Empty;
        GoogleStatusMessage = "החשבון נותק.";
    }

    [RelayCommand]
    public void OpenGoogleSheet()
    {
        if (string.IsNullOrWhiteSpace(SheetId)) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
                $"https://docs.google.com/spreadsheets/d/{SheetId.Trim()}/edit")
            { UseShellExecute = true });
        }
        catch
        {
            GoogleStatusMessage = "לא ניתן לפתוח את הדפדפן.";
        }
    }

    [RelayCommand]
    public async Task SaveRecoveryEmailAsync()
    {
        string email = RecoveryEmail.Trim();
        if (!string.IsNullOrEmpty(email) && !email.Contains('@'))
        {
            GoogleBackupStatusMessage = "כתובת אימייל אינה תקינה.";
            return;
        }
        if (string.IsNullOrEmpty(email))
        {
            await _repository.DeleteSettingAsync("recovery_email");
            GoogleBackupStatusMessage = "כתובת האימייל לשחזור הוסרה.";
        }
        else
        {
            await _repository.SaveSettingAsync("recovery_email", email);
            GoogleBackupStatusMessage = "כתובת האימייל לשחזור נשמרה.";
        }
    }

    /// <summary>Manual "backup now" trigger, parallel to the calendar's manual sync button. Writes the full current snapshot to the Google Sheets backup, replacing whatever was there before - mirrors js/googleBackup.js's backupNow.</summary>
    [RelayCommand]
    public async Task BackupToGoogleNowAsync()
    {
        if (_googleSheetsService == null)
        {
            GoogleBackupStatusMessage = "גיבוי לגוגל אינו זמין בגרסה זו.";
            return;
        }

        GoogleBackupStatusMessage = "מגבה לגוגל...";
        try
        {
            var db = await _repository.GetAllEventsAsync();
            // The PIN is one-way hashed (js/pinCrypto.js) - there is no way to recover the
            // original digits to put in a backup, so this column is always left blank for
            // backups made from this version (a legacy backup may still carry an old plain
            // PIN; restoring one still works - see RestoreFromGoogleAndEnterAsync).
            await _googleSheetsService.BackupNowAsync(db, pinPlain: string.Empty, recoveryEmail: RecoveryEmail);
            GoogleBackupStatusMessage = "הגיבוי לגוגל הושלם בהצלחה.";
        }
        catch (Exception ex)
        {
            GoogleBackupStatusMessage = $"הגיבוי נכשל: {ex.Message}";
        }
    }

    /// <summary>
    /// Restores from the Google Sheets backup WITHOUT deleting anything local - events that
    /// exist only in the backup are added, events that exist only locally are kept exactly
    /// as they are. This is the safe, non-destructive counterpart to the lock screen's
    /// "forgot PIN" restore (MainViewModel.RestoreFromGoogleAndEnterAsync), which replaces
    /// the local database outright because there is no unlocked local copy to merge against
    /// in that flow. Mirrors js/app.js's googleRestoreApply('merge') path.
    /// </summary>
    [RelayCommand]
    public async Task RestoreFromGoogleMergeAsync()
    {
        if (_googleSheetsService == null)
        {
            GoogleBackupStatusMessage = "שחזור מגוגל אינו זמין בגרסה זו.";
            return;
        }

        GoogleBackupStatusMessage = "שולף גיבוי מגוגל...";
        try
        {
            var (remoteDb, _, recoveryEmail) = await _googleSheetsService.FetchBackupAsync();
            var localDb = await _repository.GetAllEventsAsync();
            var (merged, addedKeys, _) = GoogleBackupManager.MergeDb(localDb, remoteDb);

            if (addedKeys.Count > 0)
            {
                await _repository.SaveEventsBatchAsync(merged);
            }
            if (!string.IsNullOrEmpty(recoveryEmail) && string.IsNullOrEmpty(RecoveryEmail))
            {
                RecoveryEmail = recoveryEmail;
                await _repository.SaveSettingAsync("recovery_email", recoveryEmail);
            }

            GoogleBackupStatusMessage = addedKeys.Count > 0
                ? $"מוזגו {addedKeys.Count} אירועים מהגיבוי."
                : "אין אירועים חדשים בגיבוי - הנתונים המקומיים כבר מעודכנים.";

            if (RequestRefreshCalendar != null) await RequestRefreshCalendar.Invoke();
        }
        catch (Exception ex)
        {
            GoogleBackupStatusMessage = $"השחזור נכשל: {ex.Message}";
        }
    }

    [RelayCommand]
    public async Task SyncCalendarNowAsync()
    {
        if (RequestCalendarSync == null)
        {
            CalendarStatusMessage = "סנכרון היומן אינו זמין בגרסה זו.";
            return;
        }

        CalendarStatusMessage = "מסנכרן את יומן גוגל...";
        try
        {
            var result = await RequestCalendarSync();
            CalendarStatusMessage = result.Ok
                ? $"הסנכרון הושלם: {result.Created} נוצרו, {result.Updated} עודכנו, {result.Deleted} נמחקו."
                : $"הסנכרון הסתיים עם {result.Errors.Count} שגיאות (בוצעו: {result.Created} נוצרו, {result.Updated} עודכנו, {result.Deleted} נמחקו).";

            if (_googleOAuthService != null)
            {
                var status = await _googleOAuthService.GetStatusAsync();
                CalendarLastSyncMessage = string.IsNullOrEmpty(status.CalendarLastSyncAt)
                    ? "טרם בוצע סנכרון"
                    : $"סנכרון אחרון: {status.CalendarLastSyncAt}";
            }
        }
        catch (Exception ex)
        {
            CalendarStatusMessage = $"הסנכרון נכשל: {ex.Message}";
        }
    }

    [RelayCommand]
    public async Task ClearCalendarEventsAsync()
    {
        if (RequestClearCalendarEvents == null)
        {
            CalendarStatusMessage = "סנכרון היומן אינו זמין בגרסה זו.";
            return;
        }

        try
        {
            int deleted = await RequestClearCalendarEvents();
            CalendarStatusMessage = $"נמחקו {deleted} תזכורות מהיומן.";
        }
        catch (Exception ex)
        {
            CalendarStatusMessage = $"המחיקה נכשלה: {ex.Message}";
        }
    }

    [RelayCommand]
    public void OpenGoogleCalendar()
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://calendar.google.com/")
            { UseShellExecute = true });
        }
        catch
        {
            CalendarStatusMessage = "לא ניתן לפתוח את הדפדפן.";
        }
    }

    [RelayCommand]
    public async Task DeleteAllDataAsync()
    {
        if (!DeleteAllArmed)
        {
            DeleteAllArmed = true;
            DeleteAllStatusMessage = "פעולה זו תמחק לצמיתות את כל הנתונים, קוד ה-PIN וההגדרות, ואינה ניתנת לביטול. לחץ שוב על הכפתור תוך דקה כדי לאשר את המחיקה הסופית.";
            return;
        }

        DeleteAllArmed = false;
        await _repository.WipeAllAsync();

        // Re-derive every setting from the now-empty settings table, resetting the whole
        // screen back to its first-run defaults - the same "nothing left behind" guarantee
        // js/storage.js's wipeAll() gives (PIN, email, stringencies, location - everything).
        await LoadSettingsAsync();
        ExportNotes = string.Empty;
        DeleteAllStatusMessage = "כל הנתונים, קוד ה-PIN וההגדרות נמחקו לצמיתות.";

        if (RequestRefreshCalendar != null)
        {
            await RequestRefreshCalendar();
        }
    }

    [RelayCommand]
    public void CancelDeleteAllData()
    {
        DeleteAllArmed = false;
        DeleteAllStatusMessage = string.Empty;
    }

    [RelayCommand]
    public void AddPillPeriod()
    {
        LifePillPeriods.Add(new PillPeriodViewModel { StartDate = DateTime.Today });
    }

    [RelayCommand]
    public void RemovePillPeriod(PillPeriodViewModel? period)
    {
        if (period != null) LifePillPeriods.Remove(period);
    }

    [RelayCommand]
    public async Task SendEmailExportAsync()
    {
        if (string.IsNullOrWhiteSpace(ExportEmail) || !ExportEmail.Contains('@'))
        {
            ExportStatusMessage = "נא להזין כתובת דוא\"ל תקינה.";
            return;
        }

        if (!ExportIncludeFuture && !ExportIncludeHistory)
        {
            ExportStatusMessage = "נא לבחור לפחות סוג נתונים אחד לייצוא (פרישה עתידית ו/או היסטוריה).";
            return;
        }

        if (RequestEmailExport == null)
        {
            ExportStatusMessage = "ייצוא הנתונים אינו זמין בגרסה זו.";
            return;
        }

        await _repository.SaveSettingAsync("export_email", ExportEmail.Trim());

        ExportStatusMessage = "שולח נתונים... נא להמתין";
        var result = await RequestEmailExport(ExportEmail.Trim(), ExportNotes, ExportIncludeFuture, ExportIncludeHistory, ExportIncludeNotes);
        ExportStatusMessage = result.Message;
        if (result.Success)
        {
            ExportNotes = string.Empty;
        }
    }
}

public sealed record CalendarDiscretionOption(string Value, string Label);

/// <summary>Serializable snapshot of the life-state settings ("life_state_json") - PillPeriodViewModel/the detailed fields above are the live UI state; this is only its on-disk shape.</summary>
public sealed class LifeStateDto
{
    public bool Enabled { get; set; }
    public DateTime? PregnancyDate { get; set; }
    public DateTime? BirthDate { get; set; }
    public bool Nursing { get; set; }
    public bool NursingLenient { get; set; }
    public int? AgeYears { get; set; }
    public List<PillPeriodDto> Pills { get; set; } = [];
}

public sealed class PillPeriodDto
{
    public string Type { get; set; } = "combined";
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string Reason { get; set; } = "own";
}













