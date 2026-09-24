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

    private void OnDayCardClicked(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is CalendarDayViewModel day && !day.IsPlaceholder)
        {
            _viewModel.SelectDay(day);
        }
    }

    private void OnMoreMenuClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.ContextMenu != null)
        {
            fe.ContextMenu.PlacementTarget = fe;
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
            else if (_viewModel.IsDrawerOpen)
            {
                _viewModel.CloseDrawer();
                e.Handled = true;
            }
            else if (_viewModel.IsSettingsOpen)
            {
                await _viewModel.CloseSettingsAsync();
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
                await _viewModel.SaveEntryAsync();
                e.Handled = true;
            }
        }
    }
}