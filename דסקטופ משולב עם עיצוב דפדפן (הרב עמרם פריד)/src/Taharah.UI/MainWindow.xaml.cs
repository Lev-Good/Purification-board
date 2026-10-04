using System.Windows;
using System.Windows.Input;
using Taharah.UI.Services;
using Taharah.UI.ViewModels;
using Wpf.Ui;
using Wpf.Ui.Controls;

namespace Taharah.UI;

public partial class MainWindow : FluentWindow
{
    private readonly MainViewModel _viewModel;

    public MainWindow(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        DataContext = _viewModel;

        var snackbarService = new SnackbarService();
        snackbarService.SetSnackbarPresenter(RootSnackbarPresenter);
        NotificationService.Initialize(snackbarService);

        Loaded += async (s, e) =>
        {
            await _viewModel.InitializeAsync();
        };
    }

    private async void OnDayCardClicked(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is CalendarDayViewModel day && !day.IsPlaceholder)
        {
            if (_viewModel.IsYearlyView)
            {
                await _viewModel.NavigateToDayInMonthlyViewAsync(day);
            }
            else
            {
                _viewModel.SelectDay(day);
            }
            e.Handled = true;
        }
    }

    private void OnOverlayBackgroundMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource == sender)
        {
            _viewModel.CloseAllOverlays();
            e.Handled = true;
        }
    }

    private void OnMoreMenuClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.ContextMenu != null)
        {
            fe.ContextMenu.PlacementTarget = fe;
            fe.ContextMenu.DataContext = _viewModel;
            fe.ContextMenu.IsOpen = true;
        }
    }

    private async void OnWindowKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            if (_viewModel.IsFormExpanded)
            {
                _viewModel.CancelForm();
                e.Handled = true;
            }
            else if (_viewModel.IsVesetSummaryOpen)
            {
                _viewModel.CloseVesetSummary();
                e.Handled = true;
            }
            else if (_viewModel.IsAboutOpen)
            {
                _viewModel.CloseAbout();
                e.Handled = true;
            }
            else if (_viewModel.IsGuideOpen)
            {
                _viewModel.CloseGuide();
                e.Handled = true;
            }
            else if (_viewModel.IsInsightsOpen)
            {
                _viewModel.CloseInsights();
                e.Handled = true;
            }
            else if (_viewModel.IsSettingsOpen)
            {
                await _viewModel.CloseSettingsAsync();
                e.Handled = true;
            }
            else if (_viewModel.IsDrawerOpen)
            {
                _viewModel.CloseDrawer();
                e.Handled = true;
            }
        }
        else if (e.Key == Key.Enter)
        {
            if (_viewModel.IsLocked)
            {
                await _viewModel.UnlockAppAsync();
                e.Handled = true;
            }
            else if (_viewModel.IsFormExpanded)
            {
                if (e.OriginalSource is DependencyObject d)
                {
                    var tb = FindAncestorOrSelf<System.Windows.Controls.TextBox>(d);
                    if (tb != null && tb.AcceptsReturn && !Keyboard.Modifiers.HasFlag(ModifierKeys.Control))
                    {
                        return;
                    }
                }
                await _viewModel.SaveEntryAsync();
                e.Handled = true;
            }
        }
    }

    private static T? FindAncestorOrSelf<T>(DependencyObject obj) where T : DependencyObject
    {
        while (obj != null)
        {
            if (obj is T target) return target;
            if (obj is System.Windows.Media.Visual || obj is System.Windows.Media.Media3D.Visual3D)
            {
                obj = System.Windows.Media.VisualTreeHelper.GetParent(obj);
            }
            else
            {
                obj = LogicalTreeHelper.GetParent(obj);
            }
        }
        return null;
    }
}