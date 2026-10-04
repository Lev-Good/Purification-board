using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Halacha;
using Taharah.Core.Models;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using Taharah.Web.Shared.Models;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Web.Shared.Services;

public sealed class CalendarStateService
{
    private readonly ITaharahRepository _repository;
    private readonly IJSRuntime _js;
    private readonly GoogleOAuthService? _googleOAuthService;
    private readonly GoogleSheetsService? _googleSheetsService;
    private readonly GoogleCalendarService? _googleCalendarService;
    private readonly EmailExportService _emailExportService = new();

    public event Action? OnChange;

    public HDate CurrentMonth { get; private set; }
    public DayCellModel? SelectedDay { get; private set; }
    public List<DayCellModel> DaysGrid { get; private set; } = [];
    public Dictionary<int, CalendarDayEntry> AllEvents { get; private set; } = [];
    public EngineResult? EngineResult { get; private set; }
    public List<EstablishedVeset> ActiveFixedVesets { get; private set; } = [];

    // UI View states
    private string _activeView = "calendar";
    public string ActiveView
    {
        get => _activeView;
        set
        {
            if (_activeView != value)
            {
                _activeView = value;
                NotifyStateChanged();
            }
        }
    }
    public bool IsDrawerOpen { get; set; }
    public bool IsGuidedFormOpen { get; set; }
    public string GuidedFormAction { get; set; } = "sighting";
    public bool IsDarkTheme { get; set; }
    public bool IsLocked { get; set; }

    // Yearly View State
    public bool IsYearlyView { get; private set; }
    public int YearlyViewYear { get; private set; }

    // Modals
    public bool IsSettingsOpen { get; private set; }
    public string SettingsTab { get; private set; } = "halacha"; // halacha, location, security, backup
    public bool IsAboutOpen { get; private set; }

    // UI Zoom (0.75 to 1.4)
    public double ZoomLevel { get; private set; } = 1.0;

    // Hero Dashboard Info
    public string HeroStatusTitle { get; private set; } = "טהורה לבעלה";
    public string HeroStatusDescription { get; private set; } = string.Empty;
    public string TodaySunset { get; private set; } = "16:38";
    public int NekiyimProgressDay { get; private set; } = 0; // 0 = none, 1-7
    public string? NextMikvehDateFormatted { get; private set; }

    // Halachic Alerts Panel
    public bool HasOpenFright { get; private set; }
    public string OpenFrightText { get; private set; } = string.Empty;
    public bool OpenFrightDemandsBedikah { get; private set; }
    public bool HasAnxiety { get; private set; }
    public string AnxietyText { get; private set; } = string.Empty;
    public List<string> OrZaruaExemptionItems { get; private set; } = [];
    public bool HasDayStatePanel => HasOpenFright || HasAnxiety || OrZaruaExemptionItems.Count > 0;

    // Location / Zmanim
    public string SelectedCityId { get; set; } = "jerusalem";
    public IReadOnlyList<LocationDef> AvailableCities => ZmanimManager.Locations;
    public LocationDef SelectedLocation => ZmanimManager.LocationById(SelectedCityId) ?? ZmanimManager.Locations[0];

    // Halacha & Stringencies
    public bool OrZarua { get; set; } = true;
    public bool SafekOnaBoth { get; set; }
    public bool Dilug { get; set; }
    public bool CheckUprootNonFixed { get; set; }
    public bool OrZaruaDay31 { get; set; } = true;
    public bool LateBedika { get; set; } = true;
    public bool HaflagahFromEnd { get; set; }
    public bool FrightBedika { get; set; }
    public bool StainUproots { get; set; }
    public bool ChiburLemafrea { get; set; }
    public bool VesetHagufBedika { get; set; } = true;
    public bool KaretiUfaletei { get; set; }
    public bool VesetFromBedika { get; set; }
    public bool SharpFoodOnes { get; set; }
    public bool MevuchaDays { get; set; } = true;

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
            NotifyStateChanged();
        }
    }

    // Life State
    public bool LifeEnabled { get; set; }
    public DateTime? LifePregnancyDate { get; set; }
    public DateTime? LifeBirthDate { get; set; }
    public bool LifeNursing { get; set; }
    public bool LifeNursingLenient { get; set; }
    public int? LifeAgeYears { get; set; }
    public List<PillPeriodModel> LifePillPeriods { get; } = [];

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

    // Fertility Settings
    public bool ShowFertility { get; set; } = true;
    public int FertilityLutealPhaseDays { get; set; } = FertilityInsightsManager.DefaultLutealPhaseDays;
    public string FertilityCycleBasis { get; set; } = "auto";
    public int FertilityManualCycleDays { get; set; } = FertilityInsightsManager.DefaultCycleLengthDays;
    public bool FertilityOvulationConflictAlert { get; set; } = true;

    // Security & PIN
    public bool HasPin { get; private set; }
    public string NewPin { get; set; } = string.Empty;
    public string ConfirmPin { get; set; } = string.Empty;
    public string PinStatusMessage { get; set; } = string.Empty;

    // Backup & Sync
    public string SheetId { get; set; } = string.Empty;
    public string RecoveryEmail { get; set; } = string.Empty;
    public string ExportEmail { get; set; } = string.Empty;
    public string ExportNotes { get; set; } = string.Empty;
    public bool ExportIncludeFuture { get; set; } = true;
    public bool ExportIncludeHistory { get; set; } = true;
    public bool ExportIncludeNotes { get; set; } = true;
    public string SyncStatusMessage { get; set; } = string.Empty;
    public string ClearDataStatusMessage { get; set; } = string.Empty;

    // Google Account & Sheets Backup
    public bool GoogleConnected { get; private set; }
    public string GoogleEmail { get; private set; } = string.Empty;
    public string GoogleStatusMessage { get; set; } = string.Empty;
    public string GoogleBackupStatusMessage { get; set; } = string.Empty;
    public bool IsGoogleConnecting { get; private set; }
    public bool IsGoogleBackingUp { get; private set; }
    public bool IsGoogleRestoring { get; private set; }
    public bool HasGoogleOAuthCredentials => GoogleOAuthService.HasLocalClientSecret();

    // Google Calendar Sync
    public bool CalendarSyncEnabled { get; set; }
    public string CalendarDiscretion { get; set; } = "subtle"; // "detailed" | "subtle" | "discreet"
    public string CalendarDiscreetPrefix { get; set; } = string.Empty;
    public bool CalendarNotifyEmail { get; set; } = true;
    public bool CalendarNotifyPopup { get; set; } = true;
    public string CalendarMorningTime { get; set; } = "08:30";
    public int CalendarSunsetLeadMinutes { get; set; } = 120;
    public int CalendarHefsekAdvisoryDays { get; set; } = 5;
    public bool CalendarMochDachukEnabled { get; set; }
    public bool CalendarHasScope { get; private set; }
    public string CalendarLastSyncMessage { get; private set; } = "טרם בוצע סנכרון";
    public string CalendarStatusMessage { get; set; } = string.Empty;
    public bool IsCalendarSyncing { get; private set; }
    public bool IsCalendarClearing { get; private set; }

    // Email Export
    public bool IsEmailExporting { get; private set; }
    public string ExportStatusMessage { get; set; } = string.Empty;

    public CalendarStateService(ITaharahRepository repository, IJSRuntime js) 
        : this(repository, js, null) { }

    public CalendarStateService(ITaharahRepository repository, IJSRuntime js, IServiceProvider? serviceProvider)
    {
        _repository = repository;
        _js = js;
        _googleOAuthService = serviceProvider?.GetService<GoogleOAuthService>();
        if (_googleOAuthService != null)
        {
            _googleSheetsService = new GoogleSheetsService(_googleOAuthService);
            _googleCalendarService = new GoogleCalendarService(_googleOAuthService);
        }
        int todayAbs = CurrentTodayAbs();
        CurrentMonth = new HDate(todayAbs);
        YearlyViewYear = CurrentMonth.Year;
    }

    /// <summary>
    /// "היום" ההלכתי — היום העברי מתחלף בשקיעה ולא בחצות אזרחי. זהו **נקודת הקריאה
    /// היחידה** בממשק הזה: כל מקום שצריך "היום" (המנוע, סימון "היום" בלוח, ברירת
    /// המחדל של הדשבורד, ורשימת תקופות הכדורים) קורא לכאן, ולא ל-`DateTime.Today`
    /// ישירות. ראו `ZmanimManager.HalachicTodayAbs`.
    ///
    /// <para>בלא מיקום שמור — חוזר בדיוק לחצות אזרחי (ההתנהגות הקודמת).</para>
    /// </summary>
    public int CurrentTodayAbs() => ZmanimManager.HalachicTodayAbs(SelectedLocation);

    public async Task InitializeAsync()
    {
        await _repository.InitializeAsync();
        
        try
        {
            var savedTheme = await _js.InvokeAsync<string?>("taharahInterop.getTheme");
            IsDarkTheme = savedTheme == "dark";
        }
        catch { }

        await LoadSettingsAsync();
        if (HasPin)
        {
            IsLocked = true;
        }
        await RefreshMonthAsync();
    }

    public void ZoomIn()
    {
        ZoomLevel = Math.Min(1.4, Math.Round(ZoomLevel + 0.1, 2));
        NotifyStateChanged();
    }

    public void ZoomOut()
    {
        ZoomLevel = Math.Max(0.75, Math.Round(ZoomLevel - 0.1, 2));
        NotifyStateChanged();
    }

    public void ResetZoom()
    {
        ZoomLevel = 1.0;
        NotifyStateChanged();
    }

    public void OpenSettings(string tab = "halacha")
    {
        SettingsTab = tab;
        IsSettingsOpen = true;
        SyncStatusMessage = string.Empty;
        ClearDataStatusMessage = string.Empty;
        PinStatusMessage = string.Empty;
        NotifyStateChanged();
    }

    public void CloseSettings()
    {
        IsSettingsOpen = false;
        NotifyStateChanged();
    }

    public void SetSettingsTab(string tab)
    {
        SettingsTab = tab;
        NotifyStateChanged();
    }

    public void OpenAbout()
    {
        IsAboutOpen = true;
        NotifyStateChanged();
    }

    public void CloseAbout()
    {
        IsAboutOpen = false;
        NotifyStateChanged();
    }

    public void ToggleYearlyView()
    {
        IsYearlyView = !IsYearlyView;
        YearlyViewYear = CurrentMonth.Year;
        NotifyStateChanged();
    }

    public void SetYearlyViewYear(int delta)
    {
        YearlyViewYear += delta;
        NotifyStateChanged();
    }

    public async Task NavigateToHebrewMonthAsync(int month, int year)
    {
        CurrentMonth = new HDate(1, month, year);
        IsYearlyView = false;
        await RefreshMonthAsync();
    }

    public async Task NavigateMonthAsync(int delta)
    {
        int newMonth = CurrentMonth.Month + delta;
        int newYear = CurrentMonth.Year;

        while (newMonth > 12)
        {
            newMonth -= 12;
            newYear++;
        }
        while (newMonth < 1)
        {
            newMonth += 12;
            newYear--;
        }

        CurrentMonth = new HDate(1, newMonth, newYear);
        YearlyViewYear = newYear;
        await RefreshMonthAsync();
    }

    public async Task GoToTodayAsync()
    {
        int todayAbs = CurrentTodayAbs();
        CurrentMonth = new HDate(todayAbs);
        YearlyViewYear = CurrentMonth.Year;
        IsYearlyView = false;
        await RefreshMonthAsync();
        var todayCell = DaysGrid.FirstOrDefault(d => d.Abs == todayAbs);
        if (todayCell != null)
        {
            SelectDay(todayCell);
        }
    }

    public void SelectDay(DayCellModel cell)
    {
        foreach (var d in DaysGrid)
        {
            d.IsSelected = (d.Abs == cell.Abs);
        }
        SelectedDay = cell;
        IsDrawerOpen = true;
        NotifyStateChanged();
    }

    public void CloseDrawer()
    {
        IsDrawerOpen = false;
        IsGuidedFormOpen = false;
        NotifyStateChanged();
    }

    public void OpenGuidedAction(string actionType)
    {
        GuidedFormAction = actionType;
        IsGuidedFormOpen = true;
        IsDrawerOpen = true;
        NotifyStateChanged();
    }

    public void OpenEditEntry()
    {
        if (SelectedDay?.SavedEntry != null)
        {
            var entry = SelectedDay.SavedEntry;
            string action = entry.Type switch
            {
                "reiyah" => "sighting",
                "tevilah" => "mikveh",
                _ => entry.Type
            };
            OpenGuidedAction(action);
        }
    }

    public void CloseGuidedForm()
    {
        IsGuidedFormOpen = false;
        NotifyStateChanged();
    }

    public async Task ToggleThemeAsync()
    {
        IsDarkTheme = !IsDarkTheme;
        string themeName = IsDarkTheme ? "dark" : "light";
        try
        {
            await _js.InvokeVoidAsync("taharahInterop.setTheme", themeName);
        }
        catch { }
        NotifyStateChanged();
    }

    public void SetLockState(bool locked)
    {
        IsLocked = locked;
        NotifyStateChanged();
    }

    public void LockApp()
    {
        _repository.LockDatabase();
        IsLocked = true;
        NotifyStateChanged();
    }

    public async Task<bool> UnlockWithPinAsync(string pin)
    {
        try
        {
            var pinHash = await _repository.GetSettingAsync("pin_hash");
            if (string.IsNullOrEmpty(pinHash))
            {
                IsLocked = false;
                await RefreshMonthAsync();
                NotifyStateChanged();
                return true;
            }

            bool isValid = (pinHash == pin);
            if (!isValid)
            {
                try
                {
                    var sec = new Taharah.Infrastructure.Security.SecurityService();
                    if (sec.VerifyPin(pin, pinHash)) isValid = true;
                }
                catch { }
            }

            if (!isValid)
            {
                try
                {
                    isValid = await _js.InvokeAsync<bool>("taharahInterop.verifyPin", pin);
                }
                catch { }
            }

            if (isValid)
            {
                await _repository.UnlockDatabaseAsync(pin);
                IsLocked = false;
                await RefreshMonthAsync();
                NotifyStateChanged();
                return true;
            }
            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CalendarStateService] Unlock exception: {ex.Message}");
            return false;
        }
    }

    public async Task SaveDayEventAsync(CalendarDayEntry entry)
    {
        if (SelectedDay == null) return;
        await _repository.SaveEventAsync(SelectedDay.Abs, entry);
        SelectedDay.SavedEntry = entry;
        IsGuidedFormOpen = false;
        await RefreshMonthAsync();
    }

    public async Task DeleteCurrentDayEventAsync()
    {
        if (SelectedDay == null) return;
        await _repository.DeleteEventAsync(SelectedDay.Abs);
        SelectedDay.SavedEntry = null;
        await RefreshMonthAsync();
    }

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

    private void ApplyStringenciesDict(Dictionary<string, bool> raw)
    {
        var normalized = Stringencies.Normalize(raw);
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

    public LifeStateModel BuildLifeStateModel()
    {
        int? pregAbs = LifePregnancyDate.HasValue
            ? (LifePregnancyDate.Value.Date - new DateTime(1, 1, 1)).Days + 1
            : null;
        int? birthAbs = LifeBirthDate.HasValue
            ? (LifeBirthDate.Value.Date - new DateTime(1, 1, 1)).Days + 1
            : null;

        var model = new LifeStateModel
        {
            Enabled = LifeEnabled,
            PregnancyAbs = pregAbs,
            BirthAbs = birthAbs,
            Nursing = LifeNursing,
            NursingLenient = LifeNursingLenient,
            AgeYears = LifeAgeYears
        };

        foreach (var p in LifePillPeriods)
        {
            if (p.StartDate.HasValue)
            {
                int sAbs = (p.StartDate.Value.Date - new DateTime(1, 1, 1)).Days + 1;
                int? eAbs = p.EndDate.HasValue ? (p.EndDate.Value.Date - new DateTime(1, 1, 1)).Days + 1 : null;
                model.Pills.Add(new PillPeriod
                {
                    StartAbs = sAbs,
                    EndAbs = eAbs,
                    Type = p.Type ?? "combined",
                    Reason = p.Reason ?? "own"
                });
            }
        }

        return model;
    }

    public async Task LoadSettingsAsync()
    {
        SelectedCityId = await _repository.GetSettingAsync("location_city") ?? "jerusalem";

        string? orZaruaStr = await _repository.GetSettingAsync("or_zarua_enabled");
        OrZarua = orZaruaStr == null || bool.Parse(orZaruaStr);

        string? fertStr = await _repository.GetSettingAsync("show_fertility");
        ShowFertility = fertStr == null || bool.Parse(fertStr);

        string? lutealStr = await _repository.GetSettingAsync("fertility_luteal_phase_days");
        FertilityLutealPhaseDays = int.TryParse(lutealStr, out var lutealVal) ? Math.Clamp(lutealVal, 11, 16) : FertilityInsightsManager.DefaultLutealPhaseDays;

        FertilityCycleBasis = await _repository.GetSettingAsync("fertility_cycle_basis") ?? "auto";

        string? manualCycleStr = await _repository.GetSettingAsync("fertility_manual_cycle_days");
        FertilityManualCycleDays = int.TryParse(manualCycleStr, out var manualVal) ? manualVal : FertilityInsightsManager.DefaultCycleLengthDays;

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

        string? lifeJson = await _repository.GetSettingAsync("life_state_json");
        LifePillPeriods.Clear();
        if (!string.IsNullOrEmpty(lifeJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(lifeJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("Enabled", out var eProp)) LifeEnabled = eProp.GetBoolean();
                if (root.TryGetProperty("PregnancyDate", out var pProp) && pProp.ValueKind == JsonValueKind.String)
                {
                    if (DateTime.TryParse(pProp.GetString(), out var pd)) LifePregnancyDate = pd;
                }
                if (root.TryGetProperty("BirthDate", out var bProp) && bProp.ValueKind == JsonValueKind.String)
                {
                    if (DateTime.TryParse(bProp.GetString(), out var bd)) LifeBirthDate = bd;
                }
                if (root.TryGetProperty("Nursing", out var nProp)) LifeNursing = nProp.GetBoolean();
                if (root.TryGetProperty("NursingLenient", out var nlProp)) LifeNursingLenient = nlProp.GetBoolean();
                if (root.TryGetProperty("AgeYears", out var aProp) && aProp.ValueKind == JsonValueKind.Number) LifeAgeYears = aProp.GetInt32();
                if (root.TryGetProperty("Pills", out var pillsProp) && pillsProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var pillElem in pillsProp.EnumerateArray())
                    {
                        var pModel = new PillPeriodModel
                        {
                            Type = pillElem.TryGetProperty("Type", out var tProp) ? tProp.GetString() ?? "combined" : "combined",
                            Reason = pillElem.TryGetProperty("Reason", out var rProp) ? rProp.GetString() ?? "own" : "own"
                        };
                        if (pillElem.TryGetProperty("StartDate", out var sdProp) && sdProp.ValueKind == JsonValueKind.String)
                        {
                            if (DateTime.TryParse(sdProp.GetString(), out var sd)) pModel.StartDate = sd;
                        }
                        if (pillElem.TryGetProperty("EndDate", out var edProp) && edProp.ValueKind == JsonValueKind.String)
                        {
                            if (DateTime.TryParse(edProp.GetString(), out var ed)) pModel.EndDate = ed;
                        }
                        LifePillPeriods.Add(pModel);
                    }
                }
            }
            catch { }
        }

        var pinHash = await _repository.GetSettingAsync("pin_hash");
        HasPin = !string.IsNullOrEmpty(pinHash);
        SheetId = await _repository.GetSettingAsync("google_sheet_id") ?? string.Empty;
        RecoveryEmail = await _repository.GetSettingAsync("recovery_email") ?? string.Empty;
        ExportEmail = await _repository.GetSettingAsync("export_email") ?? string.Empty;

        string? calSyncEnabledStr = await _repository.GetSettingAsync("calendar_sync_enabled");
        CalendarSyncEnabled = calSyncEnabledStr != null && bool.Parse(calSyncEnabledStr);

        CalendarDiscretion = await _repository.GetSettingAsync("calendar_discretion") ?? "subtle";
        CalendarDiscreetPrefix = await _repository.GetSettingAsync("calendar_discreet_prefix") ?? string.Empty;

        string? calNotifyEmailStr = await _repository.GetSettingAsync("calendar_notify_email");
        CalendarNotifyEmail = calNotifyEmailStr == null || bool.Parse(calNotifyEmailStr);

        string? calNotifyPopupStr = await _repository.GetSettingAsync("calendar_notify_popup");
        CalendarNotifyPopup = calNotifyPopupStr == null || bool.Parse(calNotifyPopupStr);

        CalendarMorningTime = await _repository.GetSettingAsync("calendar_morning_time") ?? "08:30";

        string? leadMinutesStr = await _repository.GetSettingAsync("calendar_sunset_lead_minutes");
        if (int.TryParse(leadMinutesStr, out int lm)) CalendarSunsetLeadMinutes = lm;

        string? hefsekDaysStr = await _repository.GetSettingAsync("calendar_hefsek_advisory_days");
        if (int.TryParse(hefsekDaysStr, out int hd)) CalendarHefsekAdvisoryDays = hd;

        string? mochStr = await _repository.GetSettingAsync("calendar_moch_dachuk_enabled");
        CalendarMochDachukEnabled = mochStr != null && bool.Parse(mochStr);

        if (_googleOAuthService != null)
        {
            try
            {
                var status = await _googleOAuthService.GetStatusAsync();
                GoogleConnected = status.Connected;
                GoogleEmail = status.Email;
                if (string.IsNullOrEmpty(SheetId) && !string.IsNullOrEmpty(status.SheetId))
                {
                    SheetId = status.SheetId;
                }
                CalendarHasScope = GoogleCalendarManager.HasCalendarScope(status.GrantedScopes);
                CalendarLastSyncMessage = string.IsNullOrEmpty(status.CalendarLastSyncAt)
                    ? "טרם בוצע סנכרון"
                    : $"סנכרון אחרון: {status.CalendarLastSyncAt}";
            }
            catch { }
        }
    }

    public async Task SaveSettingsAsync()
    {
        await _repository.SaveSettingAsync("location_city", SelectedCityId);
        await _repository.SaveSettingAsync("or_zarua_enabled", OrZarua.ToString());
        await _repository.SaveSettingAsync("show_fertility", ShowFertility.ToString());
        await _repository.SaveSettingAsync("fertility_luteal_phase_days", FertilityLutealPhaseDays.ToString());
        await _repository.SaveSettingAsync("fertility_cycle_basis", FertilityCycleBasis);
        await _repository.SaveSettingAsync("fertility_manual_cycle_days", FertilityManualCycleDays.ToString());
        await _repository.SaveSettingAsync("fertility_ovulation_conflict_alert", FertilityOvulationConflictAlert.ToString());
        await _repository.SaveSettingAsync("stringencies_json", JsonSerializer.Serialize(BuildStringenciesDict()));

        var lifeSaveObj = new
        {
            Enabled = LifeEnabled,
            PregnancyDate = LifePregnancyDate?.ToString("yyyy-MM-dd"),
            BirthDate = LifeBirthDate?.ToString("yyyy-MM-dd"),
            Nursing = LifeNursing,
            NursingLenient = LifeNursingLenient,
            AgeYears = LifeAgeYears,
            Pills = LifePillPeriods.Select(p => new
            {
                p.Type,
                StartDate = p.StartDate?.ToString("yyyy-MM-dd"),
                EndDate = p.EndDate?.ToString("yyyy-MM-dd"),
                p.Reason
            }).ToList()
        };
        await _repository.SaveSettingAsync("life_state_json", JsonSerializer.Serialize(lifeSaveObj));

        if (!string.IsNullOrWhiteSpace(SheetId))
            await _repository.SaveSettingAsync("google_sheet_id", SheetId.Trim());

        if (!string.IsNullOrWhiteSpace(RecoveryEmail))
            await _repository.SaveSettingAsync("recovery_email", RecoveryEmail.Trim());

        if (!string.IsNullOrWhiteSpace(ExportEmail))
            await _repository.SaveSettingAsync("export_email", ExportEmail.Trim());

        await _repository.SaveSettingAsync("calendar_sync_enabled", CalendarSyncEnabled.ToString());
        await _repository.SaveSettingAsync("calendar_discretion", CalendarDiscretion);
        await _repository.SaveSettingAsync("calendar_discreet_prefix", CalendarDiscreetPrefix);
        await _repository.SaveSettingAsync("calendar_notify_email", CalendarNotifyEmail.ToString());
        await _repository.SaveSettingAsync("calendar_notify_popup", CalendarNotifyPopup.ToString());
        await _repository.SaveSettingAsync("calendar_morning_time", CalendarMorningTime);
        await _repository.SaveSettingAsync("calendar_sunset_lead_minutes", CalendarSunsetLeadMinutes.ToString());
        await _repository.SaveSettingAsync("calendar_hefsek_advisory_days", CalendarHefsekAdvisoryDays.ToString());
        await _repository.SaveSettingAsync("calendar_moch_dachuk_enabled", CalendarMochDachukEnabled.ToString());

        SyncStatusMessage = "ההגדרות נשמרו בהצלחה!";
        await RefreshMonthAsync();
    }

    public async Task SetPinAsync(string pin)
    {
        if (string.IsNullOrWhiteSpace(pin) || pin.Length < 4)
        {
            PinStatusMessage = "קוד ה-PIN חייב להכיל לפחות 4 ספרות.";
            NotifyStateChanged();
            return;
        }

        await _repository.SaveSettingAsync("pin_hash", pin);
        await _repository.RekeyDatabaseAsync(pin);
        HasPin = true;
        NewPin = string.Empty;
        ConfirmPin = string.Empty;
        PinStatusMessage = "קוד ה-PIN הוגדר והופעל בהצלחה.";
        NotifyStateChanged();
    }

    public async Task RemovePinAsync()
    {
        await _repository.DeleteSettingAsync("pin_hash");
        await _repository.RemoveDatabaseEncryptionAsync();
        HasPin = false;
        NewPin = string.Empty;
        ConfirmPin = string.Empty;
        PinStatusMessage = "קוד ה-PIN וההצפנה הוסרו.";
        NotifyStateChanged();
    }

    public async Task ExportBackupJsonAsync()
    {
        try
        {
            string json = await JsonBackupManager.ExportDatabaseJsonAsync(_repository);
            string filename = $"taharah_backup_{DateTime.Today:yyyyMMdd}.json";
            await _js.InvokeVoidAsync("taharahInterop.downloadJson", filename, json);
            SyncStatusMessage = "קובץ הגיבוי יוצא ונשמר בהצלחה.";
        }
        catch (Exception ex)
        {
            SyncStatusMessage = $"שגיאה בייצוא הגיבוי: {ex.Message}";
        }
        NotifyStateChanged();
    }

    public async Task ImportBackupJsonAsync(string jsonContent)
    {
        try
        {
            var res = await JsonBackupManager.RestoreDatabaseFromJsonAsync(_repository, jsonContent, wipeExisting: true);
            if (res.Success)
            {
                SyncStatusMessage = $"השחזור הושלם בהצלחה! שוחזרו {res.ImportedCount} אירועים.";
                await RefreshMonthAsync();
            }
            else
            {
                SyncStatusMessage = $"שגיאה בשחזור הגיבוי: {res.Error}";
            }
        }
        catch (Exception ex)
        {
            SyncStatusMessage = $"שגיאה בשחזור הגיבוי: {ex.Message}";
        }
        NotifyStateChanged();
    }

    public async Task ClearAllDataAsync()
    {
        try
        {
            await _repository.WipeAllAsync();
            ClearDataStatusMessage = "כל הנתונים נמחקו לחלוטין ממאגר הנתונים.";
            await RefreshMonthAsync();
        }
        catch (Exception ex)
        {
            ClearDataStatusMessage = $"שגיאה במחיקה: {ex.Message}";
        }
        NotifyStateChanged();
    }

    public async Task ConnectGoogleAsync()
    {
        if (_googleOAuthService == null)
        {
            GoogleStatusMessage = "שירות Google אינו מופעל בסביבה זו.";
            NotifyStateChanged();
            return;
        }

        if (!GoogleOAuthService.HasLocalClientSecret())
        {
            GoogleStatusMessage = "לא נמצא קובץ google-oauth.local.json עם פרטי התחברות ל-Google.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsGoogleConnecting = true;
            GoogleStatusMessage = "נפתח חלון הזדהות בדפדפן המערכת...";
            NotifyStateChanged();
            var status = await _googleOAuthService.ConnectAsync();
            GoogleConnected = status.Connected;
            GoogleEmail = status.Email;
            CalendarHasScope = GoogleCalendarManager.HasCalendarScope(status.GrantedScopes);
            GoogleStatusMessage = status.Connected
                ? $"ההתחברות הושלמה בהצלחה לחשבון {status.Email}."
                : "ההתחברות בוטלה או לא הושלמה.";
        }
        catch (Exception ex)
        {
            GoogleStatusMessage = $"שגיאה בהתחברות: {ex.Message}";
        }
        finally
        {
            IsGoogleConnecting = false;
            NotifyStateChanged();
        }
    }

    public async Task DisconnectGoogleAsync()
    {
        if (_googleOAuthService != null)
        {
            await _googleOAuthService.DisconnectAsync();
            GoogleConnected = false;
            GoogleEmail = string.Empty;
            CalendarHasScope = false;
            GoogleStatusMessage = "החשבון נותק בהצלחה.";
            NotifyStateChanged();
        }
    }

    public async Task OpenExternalUrlAsync(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        try
        {
            if (OperatingSystem.IsWindows())
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
                return;
            }
        }
        catch { }

        try
        {
            await _js.InvokeVoidAsync("taharahInterop.openExternalUrl", url);
        }
        catch { }
    }

    public async Task OpenGoogleSheetAsync()
    {
        if (string.IsNullOrWhiteSpace(SheetId)) return;
        await OpenExternalUrlAsync($"https://docs.google.com/spreadsheets/d/{SheetId.Trim()}/edit");
    }

    public async Task OpenGoogleCalendarAsync()
    {
        await OpenExternalUrlAsync("https://calendar.google.com/");
    }

    public async Task BackupToGoogleNowAsync()
    {
        if (_googleSheetsService == null)
        {
            GoogleBackupStatusMessage = "גיבוי ענן אינו מוגדר בסביבה זו.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsGoogleBackingUp = true;
            GoogleBackupStatusMessage = "מגבה ל-Google Sheets...";
            NotifyStateChanged();
            var db = await _repository.GetAllEventsAsync();
            await _googleSheetsService.BackupNowAsync(db, pinPlain: string.Empty, recoveryEmail: RecoveryEmail);
            GoogleBackupStatusMessage = $"הגיבוי הושלם בהצלחה ב-{DateTime.Now:HH:mm}!";
        }
        catch (Exception ex)
        {
            GoogleBackupStatusMessage = $"הגיבוי נכשל: {ex.Message}";
        }
        finally
        {
            IsGoogleBackingUp = false;
            NotifyStateChanged();
        }
    }

    public async Task RestoreFromGoogleMergeAsync()
    {
        if (_googleSheetsService == null)
        {
            GoogleBackupStatusMessage = "שחזור מגוגל אינו מוגדר בסביבה זו.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsGoogleRestoring = true;
            GoogleBackupStatusMessage = "שולף נתוני גיבוי מ-Google Sheets...";
            NotifyStateChanged();
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
                ? $"מוזגו {addedKeys.Count} אירועים חדשים מהגיבוי בהצלחה!"
                : "אין אירועים חדשים בגיבוי - הנתונים המקומיים מעודכנים.";

            await RefreshMonthAsync();
        }
        catch (Exception ex)
        {
            GoogleBackupStatusMessage = $"השחזור נכשל: {ex.Message}";
        }
        finally
        {
            IsGoogleRestoring = false;
            NotifyStateChanged();
        }
    }

    public async Task SyncCalendarNowAsync()
    {
        if (_googleCalendarService == null || EngineResult == null)
        {
            CalendarStatusMessage = "סנכרון יומן אינו זמין.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsCalendarSyncing = true;
            CalendarStatusMessage = "מסנכרן תזכורות ליומן Google...";
            NotifyStateChanged();
            int todayAbs = CurrentTodayAbs();
            var settings = new CalendarSyncSettings
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
            var result = await _googleCalendarService.SyncCalendarNowAsync(AllEvents, EngineResult, SelectedLocation, todayAbs, settings);
            CalendarStatusMessage = result.Ok
                ? $"הסנכרון הושלם: {result.Created} נוצרו, {result.Updated} עודכנו, {result.Deleted} נמחקו."
                : $"הסנכרון הסתיים עם {result.Errors.Count} שגיאות ({result.Created} נוצרו, {result.Updated} עודכנו, {result.Deleted} נמחקו).";

            if (_googleOAuthService != null)
            {
                var status = await _googleOAuthService.GetStatusAsync();
                CalendarLastSyncMessage = string.IsNullOrEmpty(status.CalendarLastSyncAt)
                    ? $"סנכרון אחרון: {DateTime.Now:HH:mm}"
                    : $"סנכרון אחרון: {status.CalendarLastSyncAt}";
            }
        }
        catch (Exception ex)
        {
            CalendarStatusMessage = $"הסנכרון נכשל: {ex.Message}";
        }
        finally
        {
            IsCalendarSyncing = false;
            NotifyStateChanged();
        }
    }

    public async Task ClearCalendarEventsAsync()
    {
        if (_googleCalendarService == null)
        {
            CalendarStatusMessage = "שירות יומן אינו זמין.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsCalendarClearing = true;
            CalendarStatusMessage = "מוחק אירועי לוח טהרה מיומן Google...";
            NotifyStateChanged();
            int deleted = await _googleCalendarService.ClearAllAppEventsAsync();
            CalendarStatusMessage = $"נמחקו {deleted} תזכורות מיומן Google בהצלחה.";
        }
        catch (Exception ex)
        {
            CalendarStatusMessage = $"מחיקת התזכורות נכשלה: {ex.Message}";
        }
        finally
        {
            IsCalendarClearing = false;
            NotifyStateChanged();
        }
    }

    public async Task SendEmailExportAsync()
    {
        if (string.IsNullOrWhiteSpace(ExportEmail) || !ExportEmail.Contains('@'))
        {
            ExportStatusMessage = "נא להזין כתובת דוא\"ל תקינה.";
            NotifyStateChanged();
            return;
        }

        if (!ExportIncludeFuture && !ExportIncludeHistory)
        {
            ExportStatusMessage = "נא לבחור לפחות סוג נתונים אחד לייצוא.";
            NotifyStateChanged();
            return;
        }

        try
        {
            IsEmailExporting = true;
            ExportStatusMessage = "שולח נתונים לכתובת המייל...";
            NotifyStateChanged();
            var payload = EmailExportManager.BuildExportPayload(
                AllEvents,
                EngineResult ?? new EngineResult(),
                ExportNotes,
                ExportIncludeFuture,
                ExportIncludeHistory,
                ExportIncludeNotes);
            var result = await _emailExportService.SendAsync(ExportEmail.Trim(), payload);
            ExportStatusMessage = result.Message;
            if (result.Success)
            {
                ExportNotes = string.Empty;
                await _repository.SaveSettingAsync("export_email", ExportEmail.Trim());
            }
        }
        catch (Exception ex)
        {
            ExportStatusMessage = $"שגיאה בשליחה: {ex.Message}";
        }
        finally
        {
            IsEmailExporting = false;
            NotifyStateChanged();
        }
    }

    public string UpdateStatusMessage { get; set; } = string.Empty;
    public string LatestReleaseUrl { get; set; } = string.Empty;
    public bool IsCheckingUpdate { get; set; }

    public async Task CheckForUpdatesAsync()
    {
        IsCheckingUpdate = true;
        UpdateStatusMessage = "בודק עדכונים ב-GitHub...";
        LatestReleaseUrl = string.Empty;
        NotifyStateChanged();

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            http.DefaultRequestHeaders.Add("User-Agent", "Taharah-App");
            var response = await http.GetAsync("https://api.github.com/repos/Lev-Good/Purification-board-releases/releases/latest");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                string tagName = root.TryGetProperty("tag_name", out var tag) ? tag.GetString() ?? "" : "";
                string cleanVersion = tagName.TrimStart('v', 'V');
                string htmlUrl = root.TryGetProperty("html_url", out var link) ? link.GetString() ?? "" : "";

                string currentVersion = "3.4.1";
                if (Version.TryParse(cleanVersion, out var latestV) && Version.TryParse(currentVersion, out var curV) && latestV > curV)
                {
                    UpdateStatusMessage = $"גרסה חדשה זמינה: v{cleanVersion} (הגרסה הנוכחית: v{currentVersion})";
                    LatestReleaseUrl = htmlUrl;
                }
                else
                {
                    UpdateStatusMessage = $"התוכנה מעודכנת לגרסה האחרונה (v{currentVersion})";
                }
            }
            else
            {
                UpdateStatusMessage = "התוכנה מעודכנת לגרסה האחרונה (v3.4.1)";
            }
        }
        catch
        {
            UpdateStatusMessage = "לא ניתן לבדוק עדכונים כעת. אנא ודאי חיבור לרשת.";
        }
        finally
        {
            IsCheckingUpdate = false;
            NotifyStateChanged();
        }
    }

    public async Task RefreshMonthAsync()
    {
        AllEvents = await _repository.GetAllEventsAsync();

        int todayAbs = CurrentTodayAbs();

        // Run engine calculations with all live settings
        var engineOptions = new EngineOptions
        {
            IsOrZaruaEnabled = OrZarua,
            Today = todayAbs,
            Chazaka = true,
            Akirot = true,
            Life = BuildLifeStateModel(),
            Stringencies = BuildStringenciesDict()
        };

        EngineResult = VesetEngine.CalculateEngine(AllEvents, true, engineOptions);
        ActiveFixedVesets = EngineResult.StandingVesets;

        // Process Halachic Alerts (Fright, Anxiety, Or Zarua exemptions)
        UpdateHalachicAlerts(EngineResult);

        // Build grid
        int year = CurrentMonth.Year;
        int month = CurrentMonth.Month;
        var monthFirstDay = new HDate(1, month, year);
        int daysInMonth = monthFirstDay.DaysInMonth();
        int startDayOfWeek = monthFirstDay.DayOfWeek; // 0=Sunday..6=Saturday

        int totalCells = (startDayOfWeek + daysInMonth <= 35) ? 35 : 42;
        int firstCellAbs = monthFirstDay.Abs() - startDayOfWeek;

        var loc = SelectedLocation;

        DaysGrid = new List<DayCellModel>(totalCells);
        for (int i = 0; i < totalCells; i++)
        {
            int cellAbs = firstCellAbs + i;
            var hDate = new HDate(cellAbs);
            var gregDate = new DateTime(1, 1, 1).AddDays(cellAbs - 1);

            var cell = new DayCellModel
            {
                Abs = cellAbs,
                HDate = hDate,
                GregDate = gregDate,
                HebDayGematriya = HDate.ToGematriya(hDate.Day),
                GregDay = gregDate.Day,
                IsCurrentMonth = (hDate.Month == month && hDate.Year == year),
                IsToday = (cellAbs == todayAbs),
                IsSelected = (SelectedDay?.Abs == cellAbs)
            };

            // Zmanim
            var times = ZmanimManager.DayTimes(cellAbs, loc);
            if (times != null)
            {
                cell.SunriseTime = times.Day.Sunrise;
                cell.SunsetTime = times.Day.Sunset;
            }

            // Saved event
            if (AllEvents.TryGetValue(cellAbs, out var savedEntry))
            {
                cell.SavedEntry = savedEntry;
            }

            // Engine prishot
            if (EngineResult.Prishot.TryGetValue(cellAbs, out var prishotList))
            {
                cell.HalachicPrishot = prishotList;
            }

            // Sheva Nekiyim & Tevilah
            if (EngineResult.Nekiim.Contains(cellAbs))
            {
                cell.IsShevaNekiyimDay = true;
                int idx = EngineResult.Nekiim.IndexOf(cellAbs);
                cell.ShevaNekiyimDayNumber = (idx % 7) + 1;
            }

            if (EngineResult.Tevilot.Contains(cellAbs))
            {
                cell.IsMikvehNight = true;
            }

            // Populate Badges
            PopulateBadges(cell);

            DaysGrid.Add(cell);
        }

        // Update selected day reference to new grid item if present
        if (SelectedDay != null)
        {
            var match = DaysGrid.FirstOrDefault(d => d.Abs == SelectedDay.Abs);
            if (match != null) SelectedDay = match;
        }
        else
        {
            SelectedDay = DaysGrid.FirstOrDefault(d => d.IsToday) ?? DaysGrid.FirstOrDefault(d => d.IsCurrentMonth);
        }

        // Update Hero Dashboard
        UpdateHeroDashboard(todayAbs);

        NotifyStateChanged();
    }

    private void UpdateHalachicAlerts(EngineResult engineResult)
    {
        var fright = engineResult.Fright;
        HasOpenFright = fright.Open.Count > 0;
        if (HasOpenFright)
        {
            var latest = fright.Open[^1];
            var hd = new HDate(latest.Abs);
            OpenFrightDemandsBedikah = latest.DemandsBedikah;
            string wipeNote = latest.WipeOnly ? " (נרשם קינוח בלבד — ואינו מברר)" : "";
            string bedikahNote = latest.DemandsBedikah
                ? " — ולפי המתג שדלק (הגר״ש קלוגר): יש לבדוק בדיקה כדין בעומק ובחו״ס."
                : " — והאם צריכה בדיקה, מחלוקת החת״ס והגר״ש קלוגר.";
            OpenFrightText = $"ביום {HDate.ToGematriya(hd.Day)} {hd.GetMonthName()} נרשם פחד פתאום{wipeNote}. ביעתותא גורמת לביאת הדם, ואסור לבעלה לבוא עליה עד שישאלנה אם הרגישה{bedikahNote}";
        }
        else
        {
            OpenFrightDemandsBedikah = false;
            OpenFrightText = string.Empty;
        }

        OrZaruaExemptionItems.Clear();
        foreach (var e in engineResult.OrZaruaExemptions)
        {
            var hd = new HDate(e.Abs);
            string onaText = e.Ona == OnaType.Night ? "עונת לילה" : "עונת יום";
            OrZaruaExemptionItems.Add($"{e.Reason} — {HDate.ToGematriya(hd.Day)} {hd.GetMonthName()} ({onaText}) · {e.Source}");
        }

        HasAnxiety = fright.AnxietyDays.Count > 0;
        if (HasAnxiety)
        {
            AnxietyText = "נרשמה חרדה מתמשכת — מסלקת את הדמים, אך אינה מבטלת חששות של ראיות שכבר תועדו.";
        }
        else
        {
            AnxietyText = string.Empty;
        }
    }

    private void PopulateBadges(DayCellModel cell)
    {
        // Saved Events
        if (cell.SavedEntry != null)
        {
            var e = cell.SavedEntry;
            if (e.Type == "reiyah")
            {
                var badge = new BadgeModel
                {
                    Category = "cycle-start",
                    Text = e.Ona == OnaType.Night ? "תחילת מחזור (לילה)" : "תחילת מחזור (יום)",
                    IconType = "cycle",
                    Ona = e.Ona == OnaType.Night ? "night" : "day"
                };
                if (e.Ona == OnaType.Night) cell.NightBadges.Add(badge);
                else cell.DayBadges.Add(badge);
                cell.StatusText = "תחילת מחזור נרשמה";
            }
            else if (e.Type == "hefsek")
            {
                cell.DayBadges.Add(new BadgeModel
                {
                    Category = "hefsek",
                    Text = "הפסק טהרה",
                    IconType = "leaf",
                    Ona = "day"
                });
                cell.StatusText = "הפסק טהרה כדין";
            }
            else if (e.Type == "check")
            {
                var badge = new BadgeModel
                {
                    Category = "nekiim",
                    Text = "בדיקה",
                    IconType = "lens",
                    Ona = e.Ona == OnaType.Night ? "night" : "day"
                };
                if (e.Ona == OnaType.Night) cell.NightBadges.Add(badge);
                else cell.DayBadges.Add(badge);
            }
            else if (e.Type == "tevilah")
            {
                cell.NightBadges.Add(new BadgeModel
                {
                    Category = "mikveh",
                    Text = "טבילה במקווה",
                    IconType = "waves",
                    Ona = "night"
                });
                cell.StatusText = "טבילה הושלמה";
            }

            if (e.Marks.Count > 0)
            {
                cell.DayBadges.Add(new BadgeModel
                {
                    Category = "mark",
                    Text = "כתם נבדק",
                    IconType = "mark",
                    Ona = "day"
                });
            }
        }

        // Sheva Nekiyim day badge
        if (cell.IsShevaNekiyimDay && !cell.HasHefsek && !cell.HasReiyah)
        {
            cell.DayBadges.Add(new BadgeModel
            {
                Category = "nekiim",
                Text = $"נקיים {HDate.ToGematriya(cell.ShevaNekiyimDayNumber)}",
                IconType = "lens",
                Ona = "day"
            });
            cell.StatusText = $"שבעה נקיים — {HDate.ToGematriya(cell.ShevaNekiyimDayNumber)}";
        }

        // Mikveh Night badge
        if (cell.IsMikvehNight)
        {
            cell.NightBadges.Add(new BadgeModel
            {
                Category = "mikveh",
                Text = "ליל טבילה",
                IconType = "waves",
                Ona = "night"
            });
            cell.StatusText = "ליל טבילה במקווה";
        }

        // Halachic Prishot
        foreach (var p in cell.HalachicPrishot)
        {
            string category = p.Uprooted 
                ? "prisha-uprooted" 
                : (p.Ona == OnaType.Night ? "prisha-night" : "prisha-day");
            string label = p.Code;
            if (label == "עו״ב") label = p.Ona == OnaType.Night ? "עו״ב לילה" : "עו״ב יום";
            else if (label == "עו״ה") label = p.Ona == OnaType.Night ? "הפלגה לילה" : "הפלגה יום";
            else if (label == "יו״ח") label = p.Ona == OnaType.Night ? "יו״ח לילה" : "יו״ח יום";

            if (p.Uprooted)
            {
                label = $"{label} (נעקר)";
            }

            var badge = new BadgeModel
            {
                Category = category,
                Text = label,
                IconType = p.Ona == OnaType.Night ? "moon" : "sun",
                Tooltip = p.Reason,
                Ona = p.Ona == OnaType.Night ? "night" : "day",
                IsUprooted = p.Uprooted
            };

            if (p.Ona == OnaType.Night) cell.NightBadges.Add(badge);
            else cell.DayBadges.Add(badge);

            if (string.IsNullOrEmpty(cell.StatusText))
            {
                cell.StatusText = p.Uprooted ? "נעקרה עונת פרישה" : "עונת פרישה";
            }
        }

        if (string.IsNullOrEmpty(cell.StatusText))
        {
            cell.StatusText = "טהורה";
        }
    }

    private void UpdateHeroDashboard(int todayAbs)
    {
        var todayCell = DaysGrid.FirstOrDefault(d => d.Abs == todayAbs);
        TodaySunset = todayCell?.SunsetTime ?? "16:38";

        if (EngineResult != null && EngineResult.Nekiim.Contains(todayAbs))
        {
            int idx = EngineResult.Nekiim.IndexOf(todayAbs);
            NekiyimProgressDay = (idx % 7) + 1;
            HeroStatusTitle = $"שבעה נקיים — יום {HDate.ToGematriya(NekiyimProgressDay)} מתוך ז׳";
            HeroStatusDescription = $"נא לבצע בדיקת בין השמשות לפני שקיעת החמה ({TodaySunset}).";

            int nextTevilah = EngineResult.Tevilot.FirstOrDefault(t => t >= todayAbs);
            if (nextTevilah > 0)
            {
                var h = new HDate(nextTevilah);
                NextMikvehDateFormatted = $"{HDate.ToGematriya(h.Day)} {h.GetMonthName()}";
            }
        }
        else if (todayCell != null && todayCell.HalachicPrishot.Any(p => !p.Uprooted))
        {
            HeroStatusTitle = "עונת פרישה פעילה היום";
            HeroStatusDescription = "יש לנהוג פרישה כדין ספרי הגר״ע פריד שליט״א.";
            NekiyimProgressDay = 0;
        }
        else if (todayCell != null && todayCell.HasReiyah)
        {
            HeroStatusTitle = "תחילת מחזור / ימי ראייה";
            HeroStatusDescription = "ביום החמישי מותרת לעשות הפסק טהרה לפני השקיעה.";
            NekiyimProgressDay = 0;
        }
        else
        {
            HeroStatusTitle = "טהורה לבעלה";
            HeroStatusDescription = "אין חששות פרישה פעילים להיום.";
            NekiyimProgressDay = 0;
        }
    }

    public void NotifyStateChanged() => OnChange?.Invoke();
}
