using System.IO;
using Microsoft.Data.Sqlite;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using Taharah.UI.Services;

namespace Taharah.Core.Tests;

public class ErrorLogTests
{
    private static (SqliteTaharahRepository Repo, string DbPath) CreateEnv()
    {
        string tempDb = Path.Combine(Path.GetTempPath(), $"taharah_errorlog_test_{Guid.NewGuid():N}.db");
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
    public async Task LogErrorAsync_PersistsAndCounts()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var log = new ErrorLogService(repo);
            Assert.Equal(0, await log.GetErrorLogCountAsync());

            await log.LogErrorAsync("Something broke", "stack trace here");
            await log.LogErrorAsync("Something else broke");

            Assert.Equal(2, await log.GetErrorLogCountAsync());
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task LogErrorAsync_RingBuffer_CapsAtMaxEntries()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var log = new ErrorLogService(repo);
            for (int i = 0; i < 210; i++)
            {
                await log.LogErrorAsync($"error {i}");
            }

            Assert.Equal(200, await log.GetErrorLogCountAsync());

            // The oldest entries should have been dropped, not the newest.
            string text = await log.BuildExportTextAsync("1.0.0");
            Assert.DoesNotContain("error 0]", text);
            Assert.Contains("error 209", text);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task ClearErrorLogAsync_ResetsCountToZero()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var log = new ErrorLogService(repo);
            await log.LogErrorAsync("oops");
            Assert.Equal(1, await log.GetErrorLogCountAsync());

            await log.ClearErrorLogAsync();
            Assert.Equal(0, await log.GetErrorLogCountAsync());
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task BuildExportTextAsync_NoEntries_StillIncludesSystemInfo()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var log = new ErrorLogService(repo);
            string text = await log.BuildExportTextAsync("2.3.1");

            Assert.Contains("2.3.1", text);
            Assert.Contains("לא נרשמו תקלות", text);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public void LogErrorBlocking_NeverThrows_EvenWithNullMessage()
    {
        var (repo, dbPath) = CreateEnv();
        try
        {
            var log = new ErrorLogService(repo);
            var ex = Record.Exception(() => log.LogErrorBlocking(null, null));
            Assert.Null(ex);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }
}
