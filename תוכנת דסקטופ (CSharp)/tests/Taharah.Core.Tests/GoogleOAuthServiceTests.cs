using System.IO;
using Microsoft.Data.Sqlite;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;

namespace Taharah.Core.Tests;

public class GoogleOAuthServiceTests
{
    private static (SqliteTaharahRepository Repo, string DbPath) CreateEnv()
    {
        string tempDb = Path.Combine(Path.GetTempPath(), $"taharah_oauth_test_{Guid.NewGuid():N}.db");
        var repo = new SqliteTaharahRepository(tempDb, new SecurityService());
        repo.InitializeAsync().GetAwaiter().GetResult();
        return (repo, tempDb);
    }

    private static void Cleanup(SqliteTaharahRepository repo, string dbPath)
    {
        repo.Dispose();
        SqliteConnection.ClearAllPools();
        try { if (File.Exists(dbPath)) File.Delete(dbPath); } catch { }
    }

    [Fact]
    public async Task GetStatusAsync_NeverConnected_ReportsDisconnected()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var oauth = new GoogleOAuthService(repo, new SecurityService());
            var status = await oauth.GetStatusAsync();

            Assert.False(status.Connected);
            Assert.Equal("", status.Email);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task EnsureFreshTokenAsync_NeverConnected_ReturnsNull()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var oauth = new GoogleOAuthService(repo, new SecurityService());
            var token = await oauth.EnsureFreshTokenAsync();

            Assert.Null(token);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task DisconnectAsync_NeverConnected_DoesNotThrow()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var oauth = new GoogleOAuthService(repo, new SecurityService());
            var ex = await Record.ExceptionAsync(() => oauth.DisconnectAsync());
            Assert.Null(ex);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SetMetaAsync_PersistsFieldsReflectedByGetStatusAsync()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var oauth = new GoogleOAuthService(repo, new SecurityService());
            await oauth.SetMetaAsync(new Dictionary<string, string>
            {
                ["sheetId"] = "sheet-123",
                ["spreadsheetId"] = "spreadsheet-456",
                ["calendarId"] = "calendar-789",
                ["lastBackupAt"] = "2026-09-22T00:00:00Z"
            });

            var status = await oauth.GetStatusAsync();
            Assert.Equal("sheet-123", status.SheetId);
            Assert.Equal("spreadsheet-456", status.SpreadsheetId);
            Assert.Equal("calendar-789", status.CalendarId);
            Assert.Equal("2026-09-22T00:00:00Z", status.LastBackupAt);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task EncryptedRepositoryDataStore_RoundTripsAndDeletes()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var store = new EncryptedRepositoryDataStore(repo, new SecurityService());
            await store.StoreAsync("k1", new Dictionary<string, string> { ["a"] = "b" });

            var loaded = await store.GetAsync<Dictionary<string, string>>("k1");
            Assert.NotNull(loaded);
            Assert.Equal("b", loaded["a"]);

            // The value is encrypted on disk, not plaintext JSON.
            var rawSetting = await repo.GetSettingAsync("google_oauth_token_k1");
            Assert.NotNull(rawSetting);
            Assert.DoesNotContain("\"a\"", rawSetting);
            Assert.DoesNotContain("\"b\"", rawSetting);

            await store.DeleteAsync<Dictionary<string, string>>("k1");
            var afterDelete = await store.GetAsync<Dictionary<string, string>>("k1");
            Assert.Null(afterDelete);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void HasLocalClientSecret_NoOverrideFileShipped_ReturnsFalse()
    {
        // No "google-oauth.local.json" ships next to the test binaries (it's git-ignored,
        // per-machine only) - this is exactly the condition that otherwise surfaces deep
        // inside ConnectAsync as Google's raw "client_secret is missing" OAuth error.
        Assert.False(Taharah.Infrastructure.Backup.GoogleOAuthService.HasLocalClientSecret());
    }

    [Fact]
    public void DefaultClientId_IsThePubliclyBundledInstalledAppClient()
    {
        // Matches js/main.js's OAUTH_DEFAULT_CLIENT_ID exactly - the same registered
        // Google OAuth client is used by both the JS and C# builds of this app.
        Assert.Equal(
            "668274727663-hr2ie72vv4naboffhjvvp0rtpeh7ema0.apps.googleusercontent.com",
            GoogleOAuthService.DefaultClientId);
    }
}
