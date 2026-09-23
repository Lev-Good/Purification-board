using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Halacha;
using Taharah.Core.Models;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.UI.Services;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.UI.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ITaharahRepository _repository;
    private readonly ISecurityService _securityService;
    private readonly IPrintService _printService;
    private readonly Taharah.Infrastructure.Backup.GoogleCalendarService? _googleCalendarService;
    private readonly Taharah.Infrastructure.Backup.GoogleSheetsService? _googleSheetsService;
    private readonly Taharah.Infrastructure.Backup.GoogleOAuthService? _googleOAuthService;
    private readonly Taharah.Infrastructure.Backup.EmailExportService _emailExportService = new();

    // Cached from the most recent RefreshCalendarAsync run - Google Calendar sync (triggered
    // from the settings screen, which does not itself hold the live events/engine state)
    // reuses whatever the calendar grid itself last computed, rather than recomputing it.
    private Dictionary<int, CalendarDayEntry> _lastAllEvents = [];
    private EngineResult? _lastEngineResult;
    private LocationDef? _lastLocation;
    private int _lastTodayAbs;

    private HDate _currentHebrewMonthDate;

    [ObservableProperty]
    private string _currentHebrewMonthName = string.Empty;

    [ObservableProperty]
    private string _currentHebrewYearFormatted = string.Empty;

    [ObservableProperty]
    private string _currentGregorianHeader = string.Empty;

    [ObservableProperty]
    private CalendarDayViewModel? _selectedDay;

    [ObservableProperty]
    private bool _isDrawerOpen;

    [ObservableProperty]
    private bool _isSettingsOpen;

    [ObservableProperty]
    private bool _isGuideOpen;

    [ObservableProperty]
    private bool _isInsightsOpen;

    [ObservableProperty]
    private bool _isAboutOpen;

    [ObservableProperty]
    private bool _isVesetSummaryOpen;

    [ObservableProperty]
    private bool _hasFixedVesetBanner;

    [ObservableProperty]
    private string _fixedVesetBannerText = string.Empty;

    [ObservableProperty]
    private bool _hasSilekBanner;

    [ObservableProperty]
    private string _silekBannerText = string.Empty;

    public ObservableCollection<VesetSummaryRowViewModel> VesetSummaryRows { get; } = new();

    [ObservableProperty]
    private bool _isYearlyView;

    public ObservableCollection<YearlyMonthRowViewModel> YearlyMonths { get; } = new();

    [ObservableProperty]
    private bool _isFormExpanded;

    [ObservableProperty]
    private bool _isLocked;

    [ObservableProperty]
    private string _pinInput = string.Empty;

    [ObservableProperty]
    private string _pinErrorMessage = string.Empty;

    [ObservableProperty]
    private string _syncStatus = "עבודה מקומית ומאובטחת";

    // --- Global zoom (js/app.js's zoomIn/zoomOut/zoomReset - 70%-160%, 10% steps) ---
    private const double ZoomMin = 0.7;
    private const double ZoomMax = 1.6;
    private const double ZoomStep = 0.1;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ZoomLabel))]
    private double _zoomLevel = 1.0;

    public string ZoomLabel => $"{Math.Round(ZoomLevel * 100)}%";

    // --- Theme (js/app.js's toggleTheme - light/dark, persisted via storage.js's saveTheme) ---
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ThemeIcon))]
    private bool _isDarkTheme;

    public string ThemeIcon => IsDarkTheme ? "\u2600\ufe0f" : "\ud83c\udf19";

    [ObservableProperty]
    private EventEntryViewModel _newEntry = new();

    [ObservableProperty]
    private SettingsViewModel _settingsVm;

    [ObservableProperty]
    private string _guideSearchText = string.Empty;

    [ObservableProperty]
    private string _selectedGuideCategory = string.Empty;

    [ObservableProperty]
    private FertilityCycleReport? _fertilityReport;

    [ObservableProperty]
    private string _ovulationDateFormatted = "-";

    [ObservableProperty]
    private string _fertileWindowFormatted = "-";

    [ObservableProperty]
    private string _nextReiyahDateFormatted = "-";

    [ObservableProperty]
    private bool _showOvulationConflictAlert;

    /// <summary>Collapsed by default so the medical disclaimer text doesn't eat space in the Insights drawer - toggled by a small header link.</summary>
    [ObservableProperty]
    private bool _isMedicalDisclaimerExpanded;

    // --- Day state panel (js/ui.js's updateDayStatePanel): unresolved sudden fright, Or ---
    // --- Zarua exemptions removed from the calendar, and ongoing-anxiety information. ---

    // --- Forgot-PIN alternative on the lock screen (js/security.js's toggleForgotPasswordView /
    // restoreFromGoogleAndEnter). Only the Google-restore path is implemented here - the
    // email-based recovery in the JS app calls a Google Apps Script Web App URL specific to
    // the original author's own deployment, which this port cannot safely replicate (see
    // MIGRATION_PROGRESS.md).
    [ObservableProperty]
    private bool _isForgotPinPanelOpen;

    [RelayCommand]
    public void ToggleForgotPinPanel()
    {
        IsForgotPinPanelOpen = !IsForgotPinPanelOpen;
        PinErrorMessage = string.Empty;
    }

    /// <summary>
    /// "I don't know my PIN" recovery: downloads the latest Google Sheets backup, replaces
    /// the local database with it entirely (the local copy is encrypted and unreadable
    /// without the forgotten PIN anyway, so there is nothing to merge against), and either
    /// re-hashes a legacy plain-text PIN carried by an old backup or leaves the app with no
    /// PIN at all so the user can set a fresh one from Settings. Mirrors
    /// js/security.js's restoreFromGoogleAndEnter.
    /// </summary>
    [RelayCommand]
    public async Task RestoreFromGoogleAndEnterAsync()
    {
        if (_googleOAuthService == null || _googleSheetsService == null)
        {
            PinErrorMessage = "שחזור מגוגל אינו זמין בגרסה זו.";
            return;
        }

        try
        {
            var status = await _googleOAuthService.GetStatusAsync();
            if (!status.Connected)
            {
                PinErrorMessage = "לא מחובר חשבון גוגל במחשב זה.";
                return;
            }

            PinErrorMessage = "שולף גיבוי מגוגל...";
            var (restoredDb, pin, recoveryEmail) = await _googleSheetsService.FetchBackupAsync();

            await _repository.WipeAllAsync();
            if (restoredDb.Count > 0)
            {
                await _repository.SaveEventsBatchAsync(restoredDb);
            }

            // Only backups made before the move to one-way PIN hashing ever carry a plain
            // PIN; restoring one re-hashes it as this device's new PIN. Otherwise this
            // device is left with no PIN at all (WipeAllAsync already cleared "pin_hash") -
            // that is the whole point of this flow: never get stuck on the lock screen with
            // no way to satisfy a PIN nobody remembers.
            if (!string.IsNullOrEmpty(pin) && System.Text.RegularExpressions.Regex.IsMatch(pin, @"^\d{6}$"))
            {
                string hash = _securityService.HashPin(pin);
                await _repository.SaveSettingAsync("pin_hash", hash);
                await _repository.UnlockDatabaseAsync(pin);
            }

            if (!string.IsNullOrEmpty(recoveryEmail))
            {
                await _repository.SaveSettingAsync("recovery_email", recoveryEmail);
                SettingsVm.RecoveryEmail = recoveryEmail;
            }

            IsLocked = false;
            IsForgotPinPanelOpen = false;
            PinInput = string.Empty;
            PinErrorMessage = string.Empty;
            await RefreshCalendarAsync();
        }
        catch (Exception)
        {
            PinErrorMessage = "שחזור מגוגל נכשל. נסה שוב או השתמש בקוד הגישה.";
        }
    }

    [ObservableProperty]
    private bool _hasDayStatePanel;

    [ObservableProperty]
    private bool _hasOpenFright;

    [ObservableProperty]
    private string _openFrightText = string.Empty;

    [ObservableProperty]
    private bool _openFrightDemandsBedikah;

    [ObservableProperty]
    private bool _hasAnxiety;

    [ObservableProperty]
    private string _anxietyText = string.Empty;

    public ObservableCollection<OrZaruaExemptionItemViewModel> OrZaruaExemptionItems { get; } = new();

    public ObservableCollection<CalendarDayViewModel> CalendarDays { get; } = new();
    public ObservableCollection<HalachaTopic> FilteredGuideTopics { get; } = new();
    public IReadOnlyList<string> GuideCategories => HalachaHelpCatalog.Categories;
    public List<EstablishedVeset> ActiveFixedVesets { get; private set; } = [];

    public MainViewModel(
        ITaharahRepository repository,
        ISecurityService securityService,
        IPrintService printService,
        ErrorLogService? errorLogService = null,
        Taharah.Infrastructure.Backup.GoogleOAuthService? googleOAuthService = null)
    {
        _repository = repository;
        _securityService = securityService;
        _printService = printService;

        _settingsVm = new SettingsViewModel(_repository, _securityService, errorLogService, googleOAuthService);
        _settingsVm.RequestRefreshCalendar += RefreshCalendarAsync;
        _settingsVm.RequestEmailExport += SendEmailExportAsync;

        if (googleOAuthService != null)
        {
            _googleOAuthService = googleOAuthService;
            _googleCalendarService = new Taharah.Infrastructure.Backup.GoogleCalendarService(googleOAuthService);
            _googleSheetsService = new Taharah.Infrastructure.Backup.GoogleSheetsService(googleOAuthService);
            _settingsVm.RequestCalendarSync += SyncCalendarNowAsync;
            _settingsVm.RequestClearCalendarEvents += () => _googleCalendarService.ClearAllAppEventsAsync();
        }

        var today = DateTime.Today;
        int todayAbs = (today - new DateTime(1, 1, 1)).Days + 1;
        _currentHebrewMonthDate = new HDate(todayAbs);

        FilterGuideTopics();
    }

    public async Task InitializeAsync()
    {
        await SettingsVm.LoadSettingsAsync();

        string? zoomStr = await _repository.GetSettingAsync("zoom_level");
        if (!string.IsNullOrEmpty(zoomStr) && double.TryParse(zoomStr, out var savedZoom))
        {
            ZoomLevel = Math.Clamp(savedZoom, ZoomMin, ZoomMax);
        }

        var pinHash = await _repository.GetSettingAsync("pin_hash");
        if (!string.IsNullOrEmpty(pinHash))
        {
            // Locked: do NOT load calendar data yet. The events are encrypted at rest and
            // stay unreadable until a correct PIN derives the key (UnlockAppAsync below).
            IsLocked = true;
        }
        else
        {
            await RefreshCalendarAsync();
            _ = MaybeAutoSyncCalendarAsync();
        }
    }

    /// <summary>
    /// "Open the app" sync trigger (docs/GOOGLE_CALENDAR_SPEC.md sec.6-b/2): only fires when
    /// more than 12 hours have passed since the last sync, and only when the user actually
    /// opted in to calendar sync. Best-effort - any failure here must never surface as an
    /// error to the user or block app startup/unlock; SyncCalendarNowCommand (the manual
    /// trigger) remains the reliable way to sync on demand. The other spec trigger (debounced
    /// sync 3s after saving an event) is not yet implemented - see MIGRATION_PROGRESS.md.
    /// </summary>
    private async Task MaybeAutoSyncCalendarAsync()
    {
        if (_googleCalendarService == null || _googleOAuthService == null) return;
        if (!SettingsVm.CalendarSyncEnabled || !SettingsVm.GoogleConnected) return;

        try
        {
            var status = await _googleOAuthService.GetStatusAsync();
            if (!Taharah.Core.Algorithms.GoogleCalendarManager.HasCalendarScope(status.GrantedScopes)) return;

            bool dueForSync = true;
            if (!string.IsNullOrEmpty(status.CalendarLastSyncAt) && DateTime.TryParse(status.CalendarLastSyncAt, out var lastSync))
            {
                dueForSync = (DateTime.UtcNow - lastSync.ToUniversalTime()) > TimeSpan.FromHours(12);
            }
            if (!dueForSync) return;

            await SyncCalendarNowAsync();
        }
        catch
        {
            // Best-effort - a background sync failure must never surface at startup/unlock.
        }
    }

    private Task<Taharah.Infrastructure.Backup.EmailExportResult> SendEmailExportAsync(
        string recipientEmail, string notes, bool includeFuture, bool includeHistory, bool includeNotes)
    {
        if (_lastEngineResult == null)
        {
            return Task.FromResult(new Taharah.Infrastructure.Backup.EmailExportResult
            {
                Success = false,
                Message = "אין עדיין נתונים טעונים לייצוא."
            });
        }
        var payload = EmailExportManager.BuildExportPayload(
            _lastAllEvents, _lastEngineResult, notes, includeFuture, includeHistory, includeNotes);
        return _emailExportService.SendAsync(recipientEmail, payload);
    }

    private async Task<Taharah.Infrastructure.Backup.CalendarSyncResult> SyncCalendarNowAsync()
    {
        if (_googleCalendarService == null || _lastEngineResult == null || _lastLocation == null)
        {
            throw new InvalidOperationException("calendar_sync_unavailable");
        }
        return await _googleCalendarService.SyncCalendarNowAsync(
            _lastAllEvents, _lastEngineResult, _lastLocation, _lastTodayAbs, SettingsVm.BuildCalendarSyncSettings());
    }

    private static int GregorianDateToAbs(DateTime date) => (date.Date - new DateTime(1, 1, 1)).Days + 1;

    private LifeStateModel BuildLifeStateModel()
    {
        var s = SettingsVm;
        return new LifeStateModel
        {
            Enabled = s.LifeEnabled,
            PregnancyAbs = s.LifePregnancyDate.HasValue ? GregorianDateToAbs(s.LifePregnancyDate.Value) : null,
            BirthAbs = s.LifeBirthDate.HasValue ? GregorianDateToAbs(s.LifeBirthDate.Value) : null,
            Nursing = s.LifeNursing,
            NursingLenient = s.LifeNursingLenient,
            AgeYears = s.LifeAgeYears,
            Pills = s.LifePillPeriods
                .Where(p => p.StartDate.HasValue)
                .Select(p => new PillPeriod
                {
                    StartAbs = GregorianDateToAbs(p.StartDate!.Value),
                    EndAbs = p.EndDate.HasValue ? GregorianDateToAbs(p.EndDate.Value) : null,
                    Type = p.Type,
                    Reason = p.Reason
                }).ToList()
        };
    }

    private void UpdateDayStatePanel(EngineResult engineResult)
    {
        var fright = engineResult.Fright;

        HasOpenFright = fright.Open.Count > 0;
        if (HasOpenFright)
        {
            var latest = fright.Open[^1];
            var hd = new HDate(latest.Abs);
            OpenFrightDemandsBedikah = latest.DemandsBedikah;
            string wipeNote = latest.WipeOnly ? " (נרשם קינוח בלבד - ואינו מברר)" : "";
            string bedikahNote = latest.DemandsBedikah
                ? " - ולפי המתג שדלק (הגר\"ש קלוגר): יש לבדוק בדיקה כדין - בעומק ובחו\"ס."
                : " - והאם צריכה בדיקה, מחלוקת החת\"ס והגר\"ש קלוגר.";
            OpenFrightText = $"ביום {hd.RenderGematriya()} נרשם פחד פתאום{wipeNote}. " +
                $"\"ביעתותא... גורמים להיפך, לביאת הדם\", ולמעשה אסור לבעלה לבוא עליה עד שישאלנה אם הרגישה{bedikahNote}";
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
            OrZaruaExemptionItems.Add(new OrZaruaExemptionItemViewModel
            {
                Text = $"{e.Reason} — {hd.RenderGematriya()} ({onaText}) · {e.Source}"
            });
        }

        HasAnxiety = fright.AnxietyDays.Count > 0;
        if (HasAnxiety)
        {
            var lastAnxietyHDate = new HDate(fright.AnxietyDays[^1]);
            AnxietyText = $"נרשמה חרדה מתמשכת - מסלקת את הדמים, אך אינה מבטלת חששות של ראיות שכבר תועדו. " +
                $"היום האחרון שנרשמה בו: {lastAnxietyHDate.RenderGematriya()}";
        }
        else
        {
            AnxietyText = string.Empty;
        }

        HasDayStatePanel = HasOpenFright || OrZaruaExemptionItems.Count > 0 || HasAnxiety;
    }

    private void UpdateVesetSummary(EngineResult engineResult)
    {
        var life = engineResult.Life;

        HasSilekBanner = false;
        SilekBannerText = string.Empty;
        if (life != null && life.Silek)
        {
            HasSilekBanner = true;
            SilekBannerText = $"מסולקת דמים ({string.Join(", ", life.SilekLabels)}): החששות המפורטים בטבלה אינם נוהגים לה - " +
                "אין חוששין לוסתות שהיו לה קודם שנסתלקה, והיא פטורה מבדיקה. וכלל זה אינו חל על ראייה שתראה בתוך זמן הסילוק.";
        }
        else if (life != null && life.Dormancy.Ended)
        {
            var returned = engineResult.StandingVesets.Where(v => v.Restored).ToList();
            string returnedText = returned.Count > 0
                ? $" והוסתות שחזרו הן: {string.Join(" · ", returned.Select(ChazakaManager.DescribeVeset))}."
                : "";
            HasSilekBanner = true;
            SilekBannerText = "תם הסילוק: החששות המפורטים בטבלה - מה שהיה קודם לסילוק או בתוכו - " +
                $"אינם חוזרים, שאינה שבה אלא לוסתה שהיתה קבועה קודם הסילוק.{returnedText}";
        }

        HasFixedVesetBanner = engineResult.StandingVesets.Count > 0;
        FixedVesetBannerText = HasFixedVesetBanner
            ? $"נקבעה וסת קבועה: {string.Join(" · ", engineResult.StandingVesets.Select(ChazakaManager.DescribeVeset))} - מכוחה אין חוששים לשאר החששות שבטבלה."
            : string.Empty;

        VesetSummaryRows.Clear();
        for (int i = engineResult.Reiyot.Count - 1; i >= 0; i--)
        {
            var r = engineResult.Reiyot[i];
            string onaStr = r.Ona == OnaType.Day ? "עונת יום" : "עונת לילה";

            var yh = VesetEngine.GetYomHachodeshInfo(r.HDate);
            string yomHachodeshText;
            bool disputed = yh.Mode == "disputed" && yh.Entries.Count > 1;
            if (yh.Entries.Count == 1)
            {
                yomHachodeshText = new HDate(yh.Entries[0].Abs).RenderGematriya();
            }
            else if (yh.Entries.Count > 1)
            {
                yomHachodeshText = string.Join(" או ", yh.Entries.Select(e => new HDate(e.Abs).RenderGematriya()));
            }
            else
            {
                yomHachodeshText = "לא קיים בחודש הבא";
            }

            var row = new VesetSummaryRowViewModel
            {
                DateText = r.HDate.RenderGematriya(),
                OnaText = onaStr,
                HaflagahText = r.HaflagahDiff.HasValue ? r.HaflagahDiff.Value.ToString() : "-",
                BeinonitDay30Text = new HDate(r.Abs + 29).RenderGematriya(),
                BeinonitDay31Text = new HDate(r.Abs + 30).RenderGematriya(),
                YomHachodeshText = yomHachodeshText,
                YomHachodeshDisputed = disputed,
                NextHaflagahText = r.NextHaflagahDate?.RenderGematriya() ?? "-",
                IsEstablishing = r.Establishing
            };

            if (r.Signs.Count > 0)
            {
                row.SignNote = "מיחוש וסת הגוף: " + string.Join(", ", r.Signs.Select(VesetGufManager.BodySignLabel));
            }

            VesetSummaryRows.Add(row);
        }
    }

    partial void OnGuideSearchTextChanged(string value)
    {
        FilterGuideTopics();
    }

    private void FilterGuideTopics()
    {
        FilteredGuideTopics.Clear();
        var matches = HalachaHelpCatalog.Search(GuideSearchText);
        if (!string.IsNullOrEmpty(SelectedGuideCategory))
        {
            matches = matches.Where(t => t.Category == SelectedGuideCategory);
        }
        foreach (var t in matches)
        {
            FilteredGuideTopics.Add(t);
        }
    }

    [RelayCommand]
    public void FilterGuideCategory(string? category)
    {
        if (SelectedGuideCategory == category)
        {
            SelectedGuideCategory = string.Empty; // toggle off
        }
        else
        {
            SelectedGuideCategory = category ?? string.Empty;
        }
        FilterGuideTopics();
    }

    public async Task RefreshCalendarAsync()
    {
        CalendarDays.Clear();

        int hYear = _currentHebrewMonthDate.Year;
        int hMonth = _currentHebrewMonthDate.Month;

        CurrentHebrewMonthName = _currentHebrewMonthDate.GetMonthName();
        CurrentHebrewYearFormatted = HDate.ToGematriyaYear(hYear);

        var monthFirstDay = new HDate(1, hMonth, hYear);
        int daysInMonth = HDate.DaysInMonth(hMonth, hYear);
        int startDayOfWeek = Math.Abs(monthFirstDay.Abs() % 7); // 0 = Sunday, 6 = Saturday

        DateTime gregStart = monthFirstDay.Greg();
        DateTime gregEnd = new HDate(daysInMonth, hMonth, hYear).Greg();
        CurrentGregorianHeader = $"{gregStart:MMMM yyyy} — {gregEnd:MMMM yyyy}";

        // Get all saved events from SQLite
        var allEvents = await _repository.GetAllEventsAsync();

        // Run Fertility and cycle analytics
        int? fixedHaflagahSpan = SettingsVm.FertilityCycleBasis == "manual" ? SettingsVm.FertilityManualCycleDays : null;
        FertilityReport = FertilityInsightsManager.Analyze(allEvents, fixedHaflagahSpan, SettingsVm.FertilityLutealPhaseDays);
        ShowOvulationConflictAlert = FertilityReport.IsHalachicInfertilityRisk && SettingsVm.FertilityOvulationConflictAlert;

        if (FertilityReport.EstimatedOvulationAbs.HasValue)
        {
            var ovHDate = new HDate(FertilityReport.EstimatedOvulationAbs.Value);
            OvulationDateFormatted = $"{HDate.ToGematriya(ovHDate.Day)} {ovHDate.GetMonthName()} ({ovHDate.Greg():dd/MM})";
        }
        else
        {
            OvulationDateFormatted = "-";
        }

        if (FertilityReport.FertileWindowStartAbs.HasValue && FertilityReport.FertileWindowEndAbs.HasValue)
        {
            var startH = new HDate(FertilityReport.FertileWindowStartAbs.Value);
            var endH = new HDate(FertilityReport.FertileWindowEndAbs.Value);
            FertileWindowFormatted = $"{HDate.ToGematriya(startH.Day)}–{HDate.ToGematriya(endH.Day)} {endH.GetMonthName()}";
        }
        else
        {
            FertileWindowFormatted = "-";
        }

        if (FertilityReport.EstimatedNextReiyahAbs.HasValue)
        {
            var nextH = new HDate(FertilityReport.EstimatedNextReiyahAbs.Value);
            NextReiyahDateFormatted = $"{HDate.ToGematriya(nextH.Day)} {nextH.GetMonthName()} ({nextH.Greg():dd/MM})";
        }
        else
        {
            NextReiyahDateFormatted = "-";
        }

        // City location for Zmanim
        string cityId = SettingsVm.SelectedCityId;
        if (string.IsNullOrEmpty(cityId)) cityId = "jerusalem";
        var cityLoc = ZmanimManager.LocationById(cityId);

        // Build Engine options
        int todayAbs = (DateTime.Today - new DateTime(1, 1, 1)).Days + 1;
        var engineOptions = new EngineOptions
        {
            IsOrZaruaEnabled = SettingsVm.OrZarua,
            Today = todayAbs,
            Life = BuildLifeStateModel(),
            Stringencies = SettingsVm.BuildStringenciesDict()
        };

        // Run halachic engine calculation
        var engineResult = VesetEngine.CalculateEngine(allEvents, SettingsVm.OrZarua, engineOptions);
        ActiveFixedVesets = engineResult.StandingVesets;

        _lastAllEvents = allEvents;
        _lastEngineResult = engineResult;
        _lastLocation = cityLoc;
        _lastTodayAbs = todayAbs;

        UpdateDayStatePanel(engineResult);
        UpdateVesetSummary(engineResult);

        // Display 5 or 6 weeks (35 or 42 cells)
        int totalCells = (startDayOfWeek + daysInMonth <= 35) ? 35 : 42;
        int firstCellAbs = monthFirstDay.Abs() - startDayOfWeek;

        for (int i = 0; i < totalCells; i++)
        {
            int cellAbs = firstCellAbs + i;
            var cellHDate = new HDate(cellAbs);
            bool isCurrentMonth = (cellHDate.Month == hMonth && cellHDate.Year == hYear);
            CalendarDays.Add(BuildDayViewModel(cellAbs, isCurrentMonth, todayAbs, allEvents, engineResult, cityLoc));
        }

        if (IsYearlyView)
        {
            PopulateYearlyMonths(hYear, todayAbs, allEvents, engineResult, cityLoc);
        }

        // Restore Selection
        if (SelectedDay != null)
        {
            var match = CalendarDays.FirstOrDefault(d => d.AbsoluteDay == SelectedDay.AbsoluteDay);
            if (match != null)
            {
                SelectDay(match);
            }
        }
    }

    private CalendarDayViewModel BuildDayViewModel(
        int cellAbs, bool isCurrentMonth, int todayAbs,
        Dictionary<int, CalendarDayEntry> allEvents, EngineResult engineResult, LocationDef? cityLoc)
    {
        var cellHDate = new HDate(cellAbs);
        var cellGreg = cellHDate.Greg();

        var dayVm = new CalendarDayViewModel
        {
            DayNumber = cellGreg.Day,
            HebrewDayString = HDate.ToGematriya(cellHDate.Day),
            HebrewDateFormatted = $"{HDate.ToGematriya(cellHDate.Day)} {cellHDate.GetMonthName()} {HDate.ToGematriyaYear(cellHDate.Year)}",
            GregorianDate = cellGreg,
            AbsoluteDay = cellAbs,
            IsCurrentMonth = isCurrentMonth,
            IsToday = (cellAbs == todayAbs)
        };

        // Calculate sunrise / sunset times
        var times = ZmanimManager.DayTimes(cellAbs, cityLoc);
        if (times != null)
        {
            dayVm.Sunrise = times.Day.Sunrise;
            dayVm.Sunset = times.Day.Sunset;
        }

        // Events on this day
        if (allEvents.TryGetValue(cellAbs, out var dayEntry))
        {
            dayVm.Events.Add(dayEntry);
            string onaText = dayEntry.Ona == OnaType.Night ? "לילה" : "יום";

            if (dayEntry.Type == "reiyah")
            {
                dayVm.HasReiya = true;
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "ראייה",
                    Tooltip = $"ראייה בעונת {onaText}" + (dayEntry.Kind == "ones" ? " (אונס)" : dayEntry.Kind == "kefitza" ? " (קפיצה)" : string.Empty),
                    Category = BadgeCategory.Sighting,
                    Ona = onaText
                });
            }
            else if (dayEntry.Type == "hefsek")
            {
                dayVm.IsHefsekTaharah = true;
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "הפסק",
                    Tooltip = "הפסק טהרה לפני השקיעה",
                    Category = BadgeCategory.Hefsek,
                    Ona = "יום"
                });
            }
            else if (dayEntry.Type == "tevilah")
            {
                dayVm.IsMikvehNight = true;
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "טבילה",
                    Tooltip = "ליל טבילה במקווה",
                    Category = BadgeCategory.Mikveh,
                    Ona = "לילה"
                });
            }
            else if (dayEntry.Type == "check")
            {
                dayVm.HasCheck = true;
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "בדיקה",
                    Tooltip = $"בדיקה בעונת {onaText}",
                    Category = BadgeCategory.Check,
                    Ona = onaText
                });
            }
            else if (dayEntry.Marks.Count > 0)
            {
                string markName = string.Join(", ", dayEntry.Marks);
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "סימון",
                    Tooltip = $"סימון יום: {markName}",
                    Category = BadgeCategory.Mark,
                    Ona = onaText
                });
            }
        }

        // Active Onot / Prishot from engine
        if (engineResult.Prishot.TryGetValue(cellAbs, out var dayPrishot))
        {
            foreach (var on in dayPrishot)
            {
                dayVm.ActiveOnot.Add(on);
                bool isOrZarua = on.Code.Contains("עוא\"ז") || on.Reason.Contains("אור זרוע");
                var cat = isOrZarua ? BadgeCategory.OrZarua
                    : (on.Ona == OnaType.Night ? BadgeCategory.PrishaNight : BadgeCategory.PrishaDay);

                string prishaOna = on.Ona == OnaType.Night ? "לילה" : "יום";
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = on.Code,
                    Tooltip = $"{on.Reason} ({prishaOna})",
                    Category = cat,
                    Ona = prishaOna
                });
            }
        }

        // 7 Clean days
        if (engineResult.Nekiim.Contains(cellAbs))
        {
            int nekiyimIndex = 1;
            for (int d = 1; d <= 7; d++)
            {
                if (allEvents.TryGetValue(cellAbs - d, out var prev) && prev.Type == "hefsek")
                {
                    nekiyimIndex = d;
                    break;
                }
            }
            dayVm.ShevaNekiyimDayIndex = nekiyimIndex;
            dayVm.Badges.Add(new DayBadgeViewModel
            {
                Text = $"נקי {nekiyimIndex}",
                Tooltip = $"יום {nekiyimIndex} משבעה נקיים",
                Category = BadgeCategory.ShevaNekiyim,
                Ona = "יממה"
            });
        }

        // Mikveh night from engine
        if (engineResult.Tevilot.Contains(cellAbs))
        {
            dayVm.IsMikvehNight = true;
            if (!dayVm.Badges.Any(b => b.Text == "טבילה"))
            {
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "טבילה",
                    Tooltip = "ליל טבילה במקווה",
                    Category = BadgeCategory.Mikveh,
                    Ona = "לילה"
                });
            }
        }

        // Fertility and Ovulation markers
        if (SettingsVm.ShowFertility && FertilityReport != null)
        {
            if (FertilityReport.EstimatedOvulationAbs == cellAbs)
            {
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "ביוץ",
                    Tooltip = "יום ביוץ משוער (שיא הפוריות)",
                    Category = BadgeCategory.Ovulation,
                    Ona = "יממה"
                });
            }
            else if (FertilityReport.FertileWindowStartAbs.HasValue &&
                     FertilityReport.FertileWindowEndAbs.HasValue &&
                     cellAbs >= FertilityReport.FertileWindowStartAbs.Value &&
                     cellAbs <= FertilityReport.FertileWindowEndAbs.Value)
            {
                dayVm.Badges.Add(new DayBadgeViewModel
                {
                    Text = "פוריות",
                    Tooltip = "חלון פוריות משוער",
                    Category = BadgeCategory.Fertility,
                    Ona = "יממה"
                });
            }
        }

        dayVm.StatusSummary = DetermineDayStatus(dayVm);
        return dayVm;
    }

    private void PopulateYearlyMonths(
        int hYear, int todayAbs, Dictionary<int, CalendarDayEntry> allEvents, EngineResult engineResult, LocationDef? cityLoc)
    {
        YearlyMonths.Clear();
        int monthsInYear = HDate.MonthsInYear(hYear);
        for (int m = 1; m <= monthsInYear; m++)
        {
            var monthFirst = new HDate(1, m, hYear);
            var row = new YearlyMonthRowViewModel { MonthLabel = monthFirst.GetMonthName() };

            for (int p = 0; p < monthFirst.DayOfWeek; p++)
            {
                row.Days.Add(new CalendarDayViewModel { IsPlaceholder = true });
            }

            int daysInThisMonth = HDate.DaysInMonth(m, hYear);
            int monthStartAbs = monthFirst.Abs();
            for (int d = 0; d < daysInThisMonth; d++)
            {
                int cellAbs = monthStartAbs + d;
                row.Days.Add(BuildDayViewModel(cellAbs, isCurrentMonth: true, todayAbs, allEvents, engineResult, cityLoc));
            }

            YearlyMonths.Add(row);
        }
    }

    private static string DetermineDayStatus(CalendarDayViewModel day)
    {
        if (day.HasReiya) return "טמאה (ראייה)";
        if (day.IsHefsekTaharah) return "הפסק טהרה";
        if (day.IsMikvehNight) return "ליל טבילה";
        if (day.ShevaNekiyimDayIndex.HasValue) return $"שבעה נקיים (יום {day.ShevaNekiyimDayIndex})";
        if (day.ActiveOnot.Count > 0) return "עונת פרישה";
        return "טהורה";
    }

    private void CloseAllPanels()
    {
        IsDrawerOpen = false;
        IsSettingsOpen = false;
        IsGuideOpen = false;
        IsInsightsOpen = false;
        IsAboutOpen = false;
        IsVesetSummaryOpen = false;
    }

    [RelayCommand]
    public void SelectDay(CalendarDayViewModel day)
    {
        foreach (var d in CalendarDays)
        {
            d.IsSelected = false;
        }

        day.IsSelected = true;
        SelectedDay = day;
        CloseAllPanels();
        IsDrawerOpen = true;
        IsFormExpanded = false;
        NewEntry.Reset();
    }

    [RelayCommand]
    public void CloseDrawer()
    {
        IsDrawerOpen = false;
    }

    [RelayCommand]
    public void ToggleForm(string? entryType)
    {
        NewEntry.Reset(entryType ?? "ראייה");
        IsFormExpanded = true;
    }

    [RelayCommand]
    public void CancelForm()
    {
        IsFormExpanded = false;
        NewEntry.Reset();
    }

    [RelayCommand]
    public async Task SaveEntryAsync()
    {
        if (SelectedDay == null) return;

        var entry = new CalendarDayEntry
        {
            Note = NewEntry.Notes
        };

        var onaType = NewEntry.Ona == "לילה" ? OnaType.Night : OnaType.Day;

        switch (NewEntry.EntryType)
        {
            case "ראייה":
                entry.Type = "reiyah";
                entry.Ona = onaType;
                entry.Kind = NewEntry.ReiyahKind;
                entry.SafekOna = NewEntry.IsSafekOna;
                entry.ClosedFountain = !NewEntry.ContinuesPrevious;
                if (NewEntry.HasMultiDayBleeding)
                {
                    entry.DurationDays = Math.Clamp(NewEntry.DurationDays, 2, 30);
                }
                var reiyahSigns = NewEntry.SelectedSigns();
                if (reiyahSigns.Count > 0)
                {
                    entry.Signs = reiyahSigns;
                    entry.SignCertainty = NewEntry.SignCertainty;
                }
                break;

            case "מיחוש":
                // "מיחוש בלא ראייה" (Taharah.Core.Algorithms.VesetGufManager) - the symptom
                // itself forbids from the moment it appears, and three of the same sign
                // establish a body veset even with no accompanying bleeding at all.
                entry.Type = "sign";
                entry.Ona = onaType;
                entry.Signs = NewEntry.SelectedSigns();
                entry.SignCertainty = NewEntry.SignCertainty;
                break;

            case "הפסק טהרה":
                entry.Type = "hefsek";
                entry.Ona = OnaType.Day;
                entry.Marks = NewEntry.IsMochDachuk ? ["moch_dachuk"] : [];
                break;

            case "טבילה":
                entry.Type = "tevilah";
                entry.Ona = OnaType.Night;
                break;

            case "בדיקה":
                entry.Type = "check";
                entry.Ona = onaType;
                entry.Depth = NewEntry.CheckDepth;
                break;

            default:
                entry.Type = "mark";
                entry.Ona = onaType;
                // Taharah.Core.Algorithms.DayMarksManager.DayMarks codes exactly - a day can
                // carry several of these at once (fixed 2026-09-24: this previously stored the
                // Hebrew DISPLAY LABEL instead of the code, so no mark ever actually matched
                // anything the engine checks for - frightBedika, Or Zarua exemptions, etc. all
                // silently never triggered from the UI).
                var marks = new List<string>();
                if (NewEntry.MarkStain) marks.Add("stain");
                if (NewEntry.MarkFright) marks.Add("fright");
                if (NewEntry.MarkAnxiety) marks.Add("anxiety");
                if (NewEntry.MarkTravel) marks.Add("travel");
                if (NewEntry.MarkChuppah) marks.Add("chuppah");
                entry.Marks = marks;
                break;
        }

        await _repository.SaveEventAsync(SelectedDay.AbsoluteDay, entry);
        IsFormExpanded = false;
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public async Task DeleteEntryAsync(CalendarDayEntry entry)
    {
        if (SelectedDay == null) return;
        await _repository.DeleteEventAsync(SelectedDay.AbsoluteDay);
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public async Task NextMonthAsync()
    {
        int nextMonth = _currentHebrewMonthDate.Month + 1;
        int nextYear = _currentHebrewMonthDate.Year;
        int totalMonths = HDate.MonthsInYear(nextYear);

        if (nextMonth > totalMonths)
        {
            nextMonth = 1;
            nextYear++;
        }

        _currentHebrewMonthDate = new HDate(1, nextMonth, nextYear);
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public async Task PreviousMonthAsync()
    {
        int prevMonth = _currentHebrewMonthDate.Month - 1;
        int prevYear = _currentHebrewMonthDate.Year;

        if (prevMonth < 1)
        {
            prevYear--;
            prevMonth = HDate.MonthsInYear(prevYear);
        }

        _currentHebrewMonthDate = new HDate(1, prevMonth, prevYear);
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public async Task GoToTodayAsync()
    {
        var today = DateTime.Today;
        int todayAbs = (today - new DateTime(1, 1, 1)).Days + 1;
        _currentHebrewMonthDate = new HDate(todayAbs);
        await RefreshCalendarAsync();
        var todayCell = CalendarDays.FirstOrDefault(d => d.IsToday);
        if (todayCell != null)
        {
            SelectDay(todayCell);
        }
    }

    [RelayCommand]
    public void OpenSettings()
    {
        CloseAllPanels();
        IsSettingsOpen = true;
    }

    [RelayCommand]
    public async Task CloseSettingsAsync()
    {
        IsSettingsOpen = false;
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public void OpenGuide()
    {
        CloseAllPanels();
        IsGuideOpen = true;
    }

    [RelayCommand]
    public void CloseGuide()
    {
        IsGuideOpen = false;
    }

    [RelayCommand]
    public void OpenInsights()
    {
        CloseAllPanels();
        IsInsightsOpen = true;
    }

    [RelayCommand]
    public void CloseInsights()
    {
        IsInsightsOpen = false;
    }

    [RelayCommand]
    public void ToggleMedicalDisclaimer()
    {
        IsMedicalDisclaimerExpanded = !IsMedicalDisclaimerExpanded;
    }

    [RelayCommand]
    public void OpenAbout()
    {
        CloseAllPanels();
        IsAboutOpen = true;
    }

    [RelayCommand]
    public void CloseAbout()
    {
        IsAboutOpen = false;
    }

    [RelayCommand]
    public async Task ToggleYearlyViewAsync()
    {
        IsYearlyView = !IsYearlyView;
        await RefreshCalendarAsync();
    }

    [RelayCommand]
    public void OpenVesetSummary()
    {
        CloseAllPanels();
        IsVesetSummaryOpen = true;
    }

    [RelayCommand]
    public void CloseVesetSummary()
    {
        IsVesetSummaryOpen = false;
    }

    [RelayCommand]
    public async Task LockAppAsync()
    {
        var pinHash = await _repository.GetSettingAsync("pin_hash");
        if (!string.IsNullOrEmpty(pinHash))
        {
            _repository.LockDatabase();
            PinInput = string.Empty;
            PinErrorMessage = string.Empty;
            IsLocked = true;
            IsDrawerOpen = false;
            IsSettingsOpen = false;
            IsGuideOpen = false;
            IsInsightsOpen = false;
            IsAboutOpen = false;
            IsVesetSummaryOpen = false;
        }
    }

    [RelayCommand]
    public async Task UnlockAppAsync()
    {
        if (string.IsNullOrWhiteSpace(PinInput))
        {
            PinErrorMessage = "אנא הזיני קוד PIN.";
            return;
        }

        var storedHash = await _repository.GetSettingAsync("pin_hash");
        if (string.IsNullOrEmpty(storedHash) || _securityService.VerifyPin(PinInput.Trim(), storedHash))
        {
            try
            {
                if (!string.IsNullOrEmpty(storedHash))
                {
                    await _repository.UnlockDatabaseAsync(PinInput.Trim());
                }
                IsLocked = false;
                PinInput = string.Empty;
                PinErrorMessage = string.Empty;
                await RefreshCalendarAsync();
                _ = MaybeAutoSyncCalendarAsync();
            }
            catch (Exception)
            {
                // The encrypted events could not be decrypted (corrupted data, or a stale
                // key from a prior PIN) - fail safe rather than showing a blank/wrong board.
                PinErrorMessage = "אירעה שגיאה בפענוח הנתונים. פנה לתמיכה.";
                PinInput = string.Empty;
            }
        }
        else
        {
            PinErrorMessage = "קוד PIN שגוי, אנא נסי שנית.";
            PinInput = string.Empty;
        }
    }

    [RelayCommand]
    public async Task ZoomInAsync()
    {
        ZoomLevel = Math.Min(ZoomMax, Math.Round(ZoomLevel + ZoomStep, 1));
        await _repository.SaveSettingAsync("zoom_level", ZoomLevel.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    [RelayCommand]
    public async Task ZoomOutAsync()
    {
        ZoomLevel = Math.Max(ZoomMin, Math.Round(ZoomLevel - ZoomStep, 1));
        await _repository.SaveSettingAsync("zoom_level", ZoomLevel.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    [RelayCommand]
    public async Task ZoomResetAsync()
    {
        ZoomLevel = 1.0;
        await _repository.SaveSettingAsync("zoom_level", ZoomLevel.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    [RelayCommand]
    public async Task ToggleThemeAsync()
    {
        IsDarkTheme = !IsDarkTheme;
        string theme = IsDarkTheme ? ThemeService.Dark : ThemeService.Light;
        ThemeService.Apply(theme);
        await _repository.SaveSettingAsync("theme", theme);
    }

    [RelayCommand]
    public void PrintReport()
    {
        var city = ZmanimManager.LocationById(SettingsVm.SelectedCityId);
        string cityLabel = city?.Label ?? SettingsVm.SelectedCityId;

        var doc = _printService.CreateMonthReport(
            _currentHebrewMonthDate.Greg().Year,
            _currentHebrewMonthDate.Greg().Month,
            CurrentHebrewMonthName,
            _currentHebrewMonthDate.Year,
            CalendarDays,
            SettingsVm.LifeState,
            cityLabel,
            ActiveFixedVesets);

        _printService.PrintDocument(doc, $"דוח טהרה - {CurrentHebrewMonthName}");
    }
}

















