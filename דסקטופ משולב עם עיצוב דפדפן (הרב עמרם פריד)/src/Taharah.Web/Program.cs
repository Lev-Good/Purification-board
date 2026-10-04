using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Taharah.Infrastructure.Persistence;
using Taharah.Web.Shared;
using Taharah.Web.Shared.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<MainApp>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
builder.Services.AddScoped<ITaharahRepository, WebTaharahRepository>();
builder.Services.AddScoped<CalendarStateService>();

await builder.Build().RunAsync();
