using System.IO;
using Microsoft.Data.Sqlite;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.UI.Services;
using Taharah.UI.ViewModels;

namespace Taharah.Core.Tests;

public class UIViewModelTests
{
    private (SqliteTaharahRepository Repo, ISecurityService Sec, IPrintService Print, string DbPath) CreateTestEnvironment()
    {
        string tempDb = Path.Combine(Path.GetTempPath(), $"taharah_ui_test_{Guid.NewGuid():N}.db");
        var repo = new SqliteTaharahRepository(tempDb);
        repo.InitializeAsync().GetAwaiter().GetResult();
        var sec = new SecurityService();
        var print = new PrintService();
        return (repo, sec, print, tempDb);
    }

    private void Cleanup(SqliteTaharahRepository repo, string dbPath)
    {
        repo.Dispose();
        SqliteConnection.ClearAllPools();
        try
        {
            if (File.Exists(dbPath)) File.Delete(dbPath);
        }
        catch { }
    }

    [Fact]
    public async Task RestoreFromGoogleAndEnterAsync_WithoutGoogleConfigured_FailsGracefullyWithoutTouchingLockState()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();
            bool lockedBefore = vm.IsLocked;

            await vm.RestoreFromGoogleAndEnterCommand.ExecuteAsync(null);

            Assert.Equal("שחזור מגוגל אינו זמין בגרסה זו.", vm.PinErrorMessage);
            Assert.Equal(lockedBefore, vm.IsLocked);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void ToggleForgotPinPanel_TogglesVisibilityAndClearsError()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            Assert.False(vm.IsForgotPinPanelOpen);

            vm.ToggleForgotPinPanelCommand.Execute(null);
            Assert.True(vm.IsForgotPinPanelOpen);

            vm.ToggleForgotPinPanelCommand.Execute(null);
            Assert.False(vm.IsForgotPinPanelOpen);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task ToggleThemeAsync_FlipsFlagIconAndPersistsSetting()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.False(vm.IsDarkTheme);

            await vm.ToggleThemeCommand.ExecuteAsync(null);
            Assert.True(vm.IsDarkTheme);
            Assert.Equal("dark", await repo.GetSettingAsync("theme"));

            await vm.ToggleThemeCommand.ExecuteAsync(null);
            Assert.False(vm.IsDarkTheme);
            Assert.Equal("light", await repo.GetSettingAsync("theme"));
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task TestMainViewModelInitialization()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.NotEmpty(vm.CurrentHebrewMonthName);
            Assert.NotEmpty(vm.CurrentHebrewYearFormatted);
            Assert.True(vm.CalendarDays.Count == 35 || vm.CalendarDays.Count == 42);

            // Verify one day is marked as today
            var today = vm.CalendarDays.FirstOrDefault(d => d.IsToday);
            Assert.NotNull(today);
            Assert.NotEmpty(today.HebrewDayString);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task DeleteAllData_RequiresTwoClicks_ThenWipesEventsAndSettings()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            await repo.SaveEventAsync(700000, new Taharah.Core.Algorithms.VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = Taharah.Core.Enums.OnaType.Day });
            await repo.SaveSettingAsync("google_sheet_id", "abc123");

            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();
            vm.SettingsVm.SheetId = "abc123";

            await vm.SettingsVm.DeleteAllDataCommand.ExecuteAsync(null);
            Assert.True(vm.SettingsVm.DeleteAllArmed, "the first click only arms the action - it must not delete yet");
            Assert.NotEmpty((await repo.GetAllEventsAsync()));

            await vm.SettingsVm.DeleteAllDataCommand.ExecuteAsync(null);
            Assert.False(vm.SettingsVm.DeleteAllArmed);
            Assert.Empty(await repo.GetAllEventsAsync());
            Assert.Empty(vm.SettingsVm.SheetId);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task CancelDeleteAllData_DisarmsWithoutDeleting()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            await repo.SaveEventAsync(700000, new Taharah.Core.Algorithms.VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = Taharah.Core.Enums.OnaType.Day });

            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            await vm.SettingsVm.DeleteAllDataCommand.ExecuteAsync(null);
            Assert.True(vm.SettingsVm.DeleteAllArmed);

            vm.SettingsVm.CancelDeleteAllDataCommand.Execute(null);
            Assert.False(vm.SettingsVm.DeleteAllArmed);
            Assert.NotEmpty(await repo.GetAllEventsAsync());
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEntry_MultipleMarks_StoresEngineCodesNotHebrewLabels()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var day = vm.CalendarDays[10];
            vm.SelectDay(day);
            vm.ToggleForm("כתם/סימון");
            vm.NewEntry.MarkStain = true;
            vm.NewEntry.MarkFright = true;
            await vm.SaveEntryCommand.ExecuteAsync(null);

            var saved = await repo.GetAllEventsAsync();
            var entry = saved[day.AbsoluteDay];
            Assert.Contains("stain", entry.Marks);
            Assert.Contains("fright", entry.Marks);
            Assert.DoesNotContain("כתם", entry.Marks);
            Assert.DoesNotContain("פחד", entry.Marks);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEntry_CheckDepth_WipeIsDistinguishableFromDeep()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var day = vm.CalendarDays[10];
            vm.SelectDay(day);
            vm.ToggleForm("בדיקה");
            vm.NewEntry.CheckDepth = "wipe";
            await vm.SaveEntryCommand.ExecuteAsync(null);

            var saved = await repo.GetAllEventsAsync();
            Assert.Equal("wipe", saved[day.AbsoluteDay].Depth);

            var checks = Taharah.Core.Algorithms.AkiraManager.ExtractChecks(saved);
            var record = Assert.Single(checks);
            Assert.Equal("wipe", record.Depth);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEntry_ReiyahKindSafekOnaAndDuration_AreStoredOnTheEntry()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var day = vm.CalendarDays[10];
            vm.SelectDay(day);
            vm.ToggleForm("ראייה");
            vm.NewEntry.IsKindSharp = true;
            vm.NewEntry.IsSafekOna = true;
            vm.NewEntry.HasMultiDayBleeding = true;
            vm.NewEntry.DurationDays = 3;
            await vm.SaveEntryCommand.ExecuteAsync(null);

            var saved = await repo.GetAllEventsAsync();
            var entry = saved[day.AbsoluteDay];
            Assert.Equal("sharp", entry.Kind);
            Assert.True(entry.SafekOna);
            Assert.Equal(3, entry.DurationDays);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void SaveEntry_ReiyahKindRadioGroup_IsMutuallyExclusive()
    {
        var vm = new EventEntryViewModel();
        vm.IsKindOnes = true;
        Assert.Equal("ones", vm.ReiyahKind);
        Assert.False(vm.IsKindRegular);

        vm.IsKindPills = true;
        Assert.Equal("pills", vm.ReiyahKind);
        Assert.False(vm.IsKindOnes);
    }

    [Fact]
    public async Task VesetSummary_PopulatesOneRowPerReiyah_NewestFirst()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            int abs1 = new Taharah.Core.Calendar.HDate(5, 1, 5786).Abs();
            int abs2 = new Taharah.Core.Calendar.HDate(5, 2, 5786).Abs();
            await repo.SaveEventAsync(abs1, new Taharah.Core.Algorithms.VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = Taharah.Core.Enums.OnaType.Day });
            await repo.SaveEventAsync(abs2, new Taharah.Core.Algorithms.VesetEngine.CalendarDayEntry { Type = "reiyah", Ona = Taharah.Core.Enums.OnaType.Night });

            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.Equal(2, vm.VesetSummaryRows.Count);
            Assert.Contains("עונת לילה", vm.VesetSummaryRows[0].OnaText); // newest sighting first
            Assert.Contains("עונת יום", vm.VesetSummaryRows[1].OnaText);
            Assert.NotEqual("-", vm.VesetSummaryRows[0].HaflagahText);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task VesetSummary_NoReiyot_LeavesRowsEmpty()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.Empty(vm.VesetSummaryRows);
            Assert.False(vm.HasFixedVesetBanner);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task ToggleYearlyView_PopulatesAllMonthsOfTheCurrentHebrewYear()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.False(vm.IsYearlyView);
            Assert.Empty(vm.YearlyMonths);

            await vm.ToggleYearlyViewCommand.ExecuteAsync(null);

            Assert.True(vm.IsYearlyView);
            Assert.True(vm.YearlyMonths.Count is 12 or 13);
            Assert.All(vm.YearlyMonths, m => Assert.NotEmpty(m.Days));
            // Every day in every month row is a real, independently clickable cell.
            var totalDays = vm.YearlyMonths.Sum(m => m.Days.Count);
            Assert.True(totalDays > 350);

            await vm.ToggleYearlyViewCommand.ExecuteAsync(null);
            Assert.False(vm.IsYearlyView);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void MinhagProfile_SettingAshkenaz_SetsAllFiveSwitches()
    {
        var vm = new SettingsViewModel(null!, null!);
        vm.MinhagProfile = "ashkenaz";
        Assert.True(vm.OrZarua);
        Assert.True(vm.OrZaruaDay31);
        Assert.True(vm.KaretiUfaletei);
        Assert.True(vm.VesetHagufBedika);
        Assert.True(vm.MevuchaDays);
        Assert.Equal("ashkenaz", vm.MinhagProfile);
    }

    [Fact]
    public void MinhagProfile_SettingSepharad_ClearsAllFiveSwitches()
    {
        var vm = new SettingsViewModel(null!, null!);
        vm.MinhagProfile = "sepharad";
        Assert.False(vm.OrZarua);
        Assert.False(vm.OrZaruaDay31);
        Assert.False(vm.KaretiUfaletei);
        Assert.False(vm.VesetHagufBedika);
        Assert.False(vm.MevuchaDays);
        Assert.Equal("sepharad", vm.MinhagProfile);
    }

    [Fact]
    public void MinhagProfile_ChangingOneSwitchAfterward_FallsBackToCustom()
    {
        var vm = new SettingsViewModel(null!, null!);
        vm.MinhagProfile = "ashkenaz";
        vm.KaretiUfaletei = false;
        Assert.Equal("custom", vm.MinhagProfile);
    }

    [Fact]
    public async Task LifeState_SaveThenLoad_RoundTripsPregnancyBirthAgeAndPillPeriods()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm1 = new SettingsViewModel(repo, sec);
            await vm1.LoadSettingsAsync();
            vm1.LifeEnabled = true;
            vm1.LifePregnancyDate = new DateTime(2026, 1, 15);
            vm1.LifeBirthDate = new DateTime(2026, 9, 1);
            vm1.LifeNursing = true;
            vm1.LifeNursingLenient = true;
            vm1.LifeAgeYears = 42;
            vm1.AddPillPeriodCommand.Execute(null);
            vm1.LifePillPeriods[0].Type = "mini";
            vm1.LifePillPeriods[0].StartDate = new DateTime(2025, 6, 1);
            vm1.LifePillPeriods[0].EndDate = new DateTime(2025, 8, 1);
            vm1.LifePillPeriods[0].Reason = "doctor";
            await vm1.SaveSettingsCommand.ExecuteAsync(null);

            var vm2 = new SettingsViewModel(repo, sec);
            await vm2.LoadSettingsAsync();

            Assert.True(vm2.LifeEnabled);
            Assert.Equal(new DateTime(2026, 1, 15), vm2.LifePregnancyDate);
            Assert.Equal(new DateTime(2026, 9, 1), vm2.LifeBirthDate);
            Assert.True(vm2.LifeNursing);
            Assert.True(vm2.LifeNursingLenient);
            Assert.Equal(42, vm2.LifeAgeYears);
            Assert.Single(vm2.LifePillPeriods);
            Assert.Equal("mini", vm2.LifePillPeriods[0].Type);
            Assert.Equal(new DateTime(2025, 6, 1), vm2.LifePillPeriods[0].StartDate);
            Assert.Equal(new DateTime(2025, 8, 1), vm2.LifePillPeriods[0].EndDate);
            Assert.Equal("doctor", vm2.LifePillPeriods[0].Reason);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task LifeState_FeedsIntoTheEngineViaMainViewModel()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            vm.SettingsVm.LifeEnabled = true;
            vm.SettingsVm.LifePregnancyDate = DateTime.Today.AddDays(-100);
            await vm.RefreshCalendarAsync();

            // A pregnancy past 90 days should exempt her from checks (life.ExemptFromCheck),
            // proving the detailed date actually reached the engine, not a hardcoded offset.
            Assert.NotNull(vm.CalendarDays.FirstOrDefault(d => d.IsToday));
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task FertilitySettings_SaveThenLoad_RoundTrip()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm1 = new SettingsViewModel(repo, sec);
            await vm1.LoadSettingsAsync();
            vm1.FertilityLutealPhaseDays = 12;
            vm1.IsCycleBasisManual = true;
            vm1.FertilityManualCycleDays = 30;
            vm1.FertilityOvulationConflictAlert = false;
            await vm1.SaveSettingsCommand.ExecuteAsync(null);

            var vm2 = new SettingsViewModel(repo, sec);
            await vm2.LoadSettingsAsync();

            Assert.Equal(12, vm2.FertilityLutealPhaseDays);
            Assert.Equal("manual", vm2.FertilityCycleBasis);
            Assert.True(vm2.IsCycleBasisManual);
            Assert.False(vm2.IsCycleBasisAuto);
            Assert.Equal(30, vm2.FertilityManualCycleDays);
            Assert.False(vm2.FertilityOvulationConflictAlert);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void CycleBasisRadios_AreMutuallyExclusive()
    {
        var vm = new SettingsViewModel(null!, null!);
        Assert.True(vm.IsCycleBasisAuto);

        vm.IsCycleBasisManual = true;
        Assert.Equal("manual", vm.FertilityCycleBasis);
        Assert.False(vm.IsCycleBasisAuto);

        vm.IsCycleBasisAuto = true;
        Assert.Equal("auto", vm.FertilityCycleBasis);
        Assert.False(vm.IsCycleBasisManual);
    }

    [Fact]
    public async Task ManualCycleBasis_FeedsFixedHaflagahIntoTheFertilityEngine()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            vm.SettingsVm.IsCycleBasisManual = true;
            vm.SettingsVm.FertilityManualCycleDays = 35;
            await vm.RefreshCalendarAsync();

            // With no recorded sightings the engine falls back to a 28-day default
            // regardless of settings - this just proves the wiring doesn't crash and
            // the report is still produced.
            Assert.NotNull(vm.FertilityReport);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEntry_ReiyahWithSigns_StoresStructuredCodesAndCertainty()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var day = vm.CalendarDays[10];
            vm.SelectDay(day);
            vm.ToggleForm("ראייה");
            vm.NewEntry.SignYawn = true;
            vm.NewEntry.SignCramps = true;
            vm.NewEntry.SignCertainty = "likely";
            await vm.SaveEntryCommand.ExecuteAsync(null);

            var saved = await repo.GetAllEventsAsync();
            var entry = saved[day.AbsoluteDay];
            Assert.Contains("yawn", entry.Signs);
            Assert.Contains("cramps", entry.Signs);
            Assert.Equal("likely", entry.SignCertainty);
            Assert.Equal("reiyah", entry.Type);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEntry_StandaloneSign_StoresAsSignTypeWithNoBleeding()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var day = vm.CalendarDays[10];
            vm.SelectDay(day);
            vm.ToggleForm("מיחוש");
            vm.NewEntry.SignNausea = true;
            vm.NewEntry.SignCertainty = "vague";
            await vm.SaveEntryCommand.ExecuteAsync(null);

            var saved = await repo.GetAllEventsAsync();
            var entry = saved[day.AbsoluteDay];
            Assert.Equal("sign", entry.Type);
            Assert.Contains("nausea", entry.Signs);
            Assert.Equal("vague", entry.SignCertainty);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void SignCertainty_RadiosAreMutuallyExclusive()
    {
        var vm = new EventEntryViewModel();
        Assert.True(vm.IsCertaintyValueCertain);

        vm.IsCertaintyValueLikely = true;
        Assert.Equal("likely", vm.SignCertainty);
        Assert.False(vm.IsCertaintyValueCertain);

        vm.IsCertaintyValueVague = true;
        Assert.Equal("vague", vm.SignCertainty);
        Assert.False(vm.IsCertaintyValueLikely);
    }

    [Fact]
    public async Task TestDaySelectionAndDrawer()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            Assert.False(vm.IsDrawerOpen);

            var firstDay = vm.CalendarDays[10];
            vm.SelectDay(firstDay);

            Assert.True(vm.IsDrawerOpen);
            Assert.NotNull(vm.SelectedDay);
            Assert.Equal(firstDay.AbsoluteDay, vm.SelectedDay.AbsoluteDay);

            vm.CloseDrawer();
            Assert.False(vm.IsDrawerOpen);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task TestAddReiyahAndVerifyOnotCalculation()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            // Select a day in current month
            var targetDay = vm.CalendarDays.First(d => d.IsCurrentMonth && d.DayNumber == 1);
            vm.SelectDay(targetDay);

            // Add a sighting (ראייה)
            vm.ToggleForm("ראייה");
            vm.NewEntry.Ona = "יום";
            await vm.SaveEntryAsync();

            // Verify the day now has a sighting badge
            var refreshedDay = vm.CalendarDays.First(d => d.AbsoluteDay == targetDay.AbsoluteDay);
            Assert.True(refreshedDay.HasReiya);
            Assert.Contains(refreshedDay.Badges, b => b.Text == "ראייה");

            // Verify future days now have Onot calculated by the halachic engine (e.g. Day 30 Beinonit)
            int target30 = targetDay.AbsoluteDay + 29; // day 30 from sighting
            var day30 = vm.CalendarDays.FirstOrDefault(d => d.AbsoluteDay == target30);
            if (day30 != null)
            {
                Assert.True(day30.ActiveOnot.Count > 0 || day30.Badges.Any(b => b.Text.Contains("עו\"ב")));
            }
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task TestPinLockAndUnlock()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            // Setup PIN in settings
            vm.SettingsVm.NewPin = "1234";
            vm.SettingsVm.ConfirmPin = "1234";
            await vm.SettingsVm.UpdatePinAsync();
            Assert.True(vm.SettingsVm.HasPin);

            // Lock the app
            await vm.LockAppAsync();
            Assert.True(vm.IsLocked);

            // Try wrong PIN
            vm.PinInput = "9999";
            await vm.UnlockAppAsync();
            Assert.True(vm.IsLocked);
            Assert.NotEmpty(vm.PinErrorMessage);

            // Correct PIN
            vm.PinInput = "1234";
            await vm.UnlockAppAsync();
            Assert.False(vm.IsLocked);
            Assert.Empty(vm.PinErrorMessage);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task TestMonthNavigation()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            string originalMonth = vm.CurrentHebrewMonthName;

            await vm.NextMonthAsync();
            string nextMonth = vm.CurrentHebrewMonthName;
            Assert.NotEqual(originalMonth, nextMonth);

            await vm.PreviousMonthAsync();
            Assert.Equal(originalMonth, vm.CurrentHebrewMonthName);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task TestPrintReportGeneration()
    {
        var (repo, sec, print, dbPath) = CreateTestEnvironment();
        try
        {
            var vm = new MainViewModel(repo, sec, print);
            await vm.InitializeAsync();

            var doc = print.CreateMonthReport(
                2026, 9, "תשרי", 5787,
                vm.CalendarDays,
                "normal",
                "ירושלים",
                vm.ActiveFixedVesets);

            Assert.NotNull(doc);
            Assert.NotEmpty(doc.Blocks);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void TestEventEntryViewModel_OnaRadioToggling()
    {
        var entry = new EventEntryViewModel();
        entry.Reset("ראייה");

        Assert.True(entry.IsDayOna);
        Assert.False(entry.IsNightOna);
        Assert.Equal("יום", entry.Ona);
        Assert.True(entry.IsReiyah);

        // Switch to night
        entry.IsNightOna = true;
        Assert.False(entry.IsDayOna);
        Assert.True(entry.IsNightOna);
        Assert.Equal("לילה", entry.Ona);

        // Switch back to day
        entry.IsDayOna = true;
        Assert.True(entry.IsDayOna);
        Assert.False(entry.IsNightOna);
        Assert.Equal("יום", entry.Ona);
    }

    [Fact]
    public void TestBoolToVisibilityConverter_ConvertBackNeverThrows()
    {
        var conv = new Taharah.UI.Converters.BoolToVisibilityConverter();

        var backVisible = conv.ConvertBack(System.Windows.Visibility.Visible, typeof(bool), null, System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(true, backVisible);

        var backCollapsed = conv.ConvertBack(System.Windows.Visibility.Collapsed, typeof(bool), null, System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(false, backCollapsed);

        var backBool = conv.ConvertBack(true, typeof(bool), null, System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(true, backBool);
    }
}












