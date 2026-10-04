using System.Net.Http.Json;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Util.Store;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;

namespace Taharah.Infrastructure.Backup;

/// <summary>
/// Persists OAuth tokens through the app's own repository, each value encrypted at rest
/// with the OS secret store (DPAPI via ISecurityService) - mirrors js/main.js's use of
/// Electron's safeStorage for the same google-oauth-store.json.
/// </summary>
public sealed class EncryptedRepositoryDataStore(ITaharahRepository repository, ISecurityService securityService) : IDataStore
{
    private const string KeyPrefix = "google_oauth_token_";

    public async Task StoreAsync<T>(string key, T value)
    {
        string json = JsonSerializer.Serialize(value);
        await repository.SaveSettingAsync(KeyPrefix + key, securityService.EncryptString(json));
    }

    public async Task DeleteAsync<T>(string key)
    {
        await repository.DeleteSettingAsync(KeyPrefix + key);
    }

    public async Task<T> GetAsync<T>(string key)
    {
        var stored = await repository.GetSettingAsync(KeyPrefix + key);
        if (string.IsNullOrEmpty(stored)) return default!;
        try
        {
            string json = securityService.DecryptString(stored);
            return JsonSerializer.Deserialize<T>(json)!;
        }
        catch
        {
            return default!;
        }
    }

    public Task ClearAsync()
    {
        // Only ever one token key ("user") is stored by this app; DisconnectAsync deletes
        // it directly via DeleteTokenAsync instead of relying on this rarely-used method.
        return Task.CompletedTask;
    }
}

public sealed class GoogleOAuthStatus
{
    public bool Connected { get; set; }
    public string Email { get; set; } = string.Empty;
    public string SpreadsheetId { get; set; } = string.Empty;
    public string SheetId { get; set; } = string.Empty;
    public string LastBackupAt { get; set; } = string.Empty;
    public string CalendarId { get; set; } = string.Empty;
    public string CalendarLastSyncAt { get; set; } = string.Empty;
    public string GrantedScopes { get; set; } = string.Empty;
}

/// <summary>
/// Google OAuth 2.0 loopback flow (installed-app / PKCE), built on the official
/// Google.Apis.Auth library instead of hand-rolling the HTTP listener js/main.js uses -
/// the library's AuthorizationCodeInstalledApp + LocalServerCodeReceiver cover the same
/// ground (opens the system browser, binds a loopback port, exchanges the code, persists
/// and auto-refreshes the token) more robustly than a hand-rolled server would.
///
/// Shipping model matches js/main.js exactly: the app carries a bundled, non-confidential
/// OAuth client ID (Google's own classification for "Desktop app" / installed-app clients,
/// RFC 8252). The client secret is intentionally NOT hardcoded in source - it is read from
/// a git-ignored "google-oauth.local.json" file next to the executable
/// ({ "clientId": "...", "clientSecret": "..." }), the exact same file shape the JS app
/// uses. Without that file the Google features degrade gracefully rather than silently
/// using a real secret committed to source control.
/// </summary>
public sealed class GoogleOAuthService
{
    public const string DefaultClientId = "668274727663-hr2ie72vv4naboffhjvvp0rtpeh7ema0.apps.googleusercontent.com";

    // drive.file (non-sensitive - only files the app itself created) + calendar, matching
    // js/main.js's OAUTH_SCOPE exactly. Requesting the broader spreadsheets scope instead
    // would force Google's OAuth verification review for no benefit.
    private static readonly string[] Scopes =
    [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/calendar"
    ];

    private const string UserId = "user";

    private readonly ITaharahRepository _repository;
    private readonly EncryptedRepositoryDataStore _dataStore;

    public GoogleOAuthService(ITaharahRepository repository, ISecurityService securityService)
    {
        _repository = repository;
        _dataStore = new EncryptedRepositoryDataStore(repository, securityService);
    }

    /// <summary>False when "google-oauth.local.json" is missing/empty next to the exe - the exact condition that otherwise surfaces as Google's raw "client_secret is missing" OAuth error deep inside ConnectAsync.</summary>
    public static bool HasLocalClientSecret() => !string.IsNullOrEmpty(ReadCredentials().ClientSecret);

    private static (string ClientId, string ClientSecret) ReadCredentials()
    {
        string clientId = "";
        string clientSecret = "";
        try
        {
            string overridePath = Path.Combine(AppContext.BaseDirectory, "google-oauth.local.json");
            if (File.Exists(overridePath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(overridePath));
                if (doc.RootElement.TryGetProperty("clientId", out var idEl)) clientId = idEl.GetString() ?? "";
                if (doc.RootElement.TryGetProperty("clientSecret", out var secEl)) clientSecret = secEl.GetString() ?? "";
            }
        }
        catch
        {
            // Missing/unreadable override file - fall back to the bundled client id below.
        }
        return (string.IsNullOrEmpty(clientId) ? DefaultClientId : clientId, clientSecret);
    }

    private GoogleAuthorizationCodeFlow BuildFlow()
    {
        var (clientId, clientSecret) = ReadCredentials();
        return new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets { ClientId = clientId, ClientSecret = clientSecret },
            Scopes = Scopes,
            DataStore = _dataStore
        });
    }

    /// <summary>Runs the full consent flow: opens the system browser, catches the loopback redirect, exchanges the code, and persists the resulting token.</summary>
    public async Task<GoogleOAuthStatus> ConnectAsync(CancellationToken cancellationToken = default)
    {
        using var flow = BuildFlow();
        var app = new AuthorizationCodeInstalledApp(flow, new LocalServerCodeReceiver());
        var credential = await app.AuthorizeAsync(UserId, cancellationToken);

        string email = await FetchUserEmailAsync(credential.Token.AccessToken, cancellationToken);
        await _repository.SaveSettingAsync("google_email", email);

        return await GetStatusAsync(cancellationToken);
    }

    private static async Task<string> FetchUserEmailAsync(string accessToken, CancellationToken cancellationToken)
    {
        try
        {
            using var http = new HttpClient();
            http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
            var info = await http.GetFromJsonAsync<JsonElement>("https://www.googleapis.com/oauth2/v3/userinfo", cancellationToken);
            return info.TryGetProperty("email", out var emailEl) ? (emailEl.GetString() ?? "") : "";
        }
        catch
        {
            return "";
        }
    }

    public async Task<GoogleOAuthStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        using var flow = BuildFlow();
        var token = await flow.LoadTokenAsync(UserId, cancellationToken);
        bool connected = !string.IsNullOrEmpty(token?.RefreshToken);

        return new GoogleOAuthStatus
        {
            Connected = connected,
            Email = await _repository.GetSettingAsync("google_email") ?? "",
            SpreadsheetId = await _repository.GetSettingAsync("google_spreadsheet_id") ?? "",
            SheetId = await _repository.GetSettingAsync("google_sheet_id") ?? "",
            LastBackupAt = await _repository.GetSettingAsync("google_last_backup_at") ?? "",
            CalendarId = await _repository.GetSettingAsync("google_calendar_id") ?? "",
            CalendarLastSyncAt = await _repository.GetSettingAsync("google_calendar_last_sync_at") ?? "",
            GrantedScopes = token?.Scope ?? ""
        };
    }

    /// <summary>A valid access token, refreshing via the stored refresh token when needed. Null when never connected / offline / refresh failed.</summary>
    public async Task<string?> EnsureFreshTokenAsync(CancellationToken cancellationToken = default)
    {
        using var flow = BuildFlow();
        var token = await flow.LoadTokenAsync(UserId, cancellationToken);
        if (string.IsNullOrEmpty(token?.RefreshToken)) return null;

        var credential = new UserCredential(flow, UserId, token);
        try
        {
            return await credential.GetAccessTokenForRequestAsync(cancellationToken: cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Saves arbitrary connection metadata (sheetId, spreadsheetId, lastBackupAt, calendarId, calendarLastSyncAt) - mirrors js/main.js's oauth-set-meta IPC handler.</summary>
    public async Task SetMetaAsync(Dictionary<string, string> patch)
    {
        var keyMap = new Dictionary<string, string>
        {
            ["email"] = "google_email",
            ["spreadsheetId"] = "google_spreadsheet_id",
            ["sheetId"] = "google_sheet_id",
            ["lastBackupAt"] = "google_last_backup_at",
            ["calendarId"] = "google_calendar_id",
            ["calendarLastSyncAt"] = "google_calendar_last_sync_at"
        };
        foreach (var (jsKey, settingKey) in keyMap)
        {
            if (patch.TryGetValue(jsKey, out var value))
            {
                await _repository.SaveSettingAsync(settingKey, value);
            }
        }
    }

    /// <summary>Best-effort server-side token revoke, then clears the local token and connection metadata - "no PIN" style clean disconnect, not a silent no-op.</summary>
    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        using var flow = BuildFlow();
        var token = await flow.LoadTokenAsync(UserId, cancellationToken);
        if (!string.IsNullOrEmpty(token?.RefreshToken))
        {
            try
            {
                using var http = new HttpClient();
                await http.PostAsync(
                    $"https://oauth2.googleapis.com/revoke?token={Uri.EscapeDataString(token.RefreshToken)}",
                    content: null, cancellationToken);
            }
            catch
            {
                // Offline revoke attempt is best-effort only.
            }
        }

        await flow.DeleteTokenAsync(UserId, cancellationToken);
        await _repository.DeleteSettingAsync("google_email");
        await _repository.DeleteSettingAsync("google_calendar_id");
        await _repository.DeleteSettingAsync("google_calendar_last_sync_at");
    }
}
