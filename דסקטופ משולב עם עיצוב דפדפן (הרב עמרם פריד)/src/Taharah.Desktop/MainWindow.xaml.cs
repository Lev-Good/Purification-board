using System.IO;
using System.Windows;
using Microsoft.AspNetCore.Components.WebView.Wpf;
using Microsoft.Extensions.DependencyInjection;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.Web.Shared;
using Taharah.Web.Shared.Services;

namespace Taharah.Desktop;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        var services = new ServiceCollection();
        services.AddWpfBlazorWebView();

        string appDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
            "TaharahApp");
        Directory.CreateDirectory(appDataFolder);
        string dbPath = Path.Combine(appDataFolder, "taharah.db");

        var securityService = new SecurityService();
        var repository = new SqliteTaharahRepository(dbPath, securityService);
        var googleOAuthService = new Taharah.Infrastructure.Backup.GoogleOAuthService(repository, securityService);

        services.AddSingleton<ISecurityService>(securityService);
        services.AddSingleton<ITaharahRepository>(repository);
        services.AddSingleton(googleOAuthService);
        services.AddScoped<CalendarStateService>();

        blazorWebView.Services = services.BuildServiceProvider();
        blazorWebView.RootComponents.Add(new RootComponent
        {
            Selector = "#app",
            ComponentType = typeof(MainApp)
        });
    }
}