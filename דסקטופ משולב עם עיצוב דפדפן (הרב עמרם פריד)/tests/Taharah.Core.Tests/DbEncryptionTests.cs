using System.IO;
using Microsoft.Data.Sqlite;
using Taharah.Core.Enums;
using Taharah.Infrastructure.Persistence;
using Taharah.Infrastructure.Security;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class DbEncryptionTests
{
    private static (SqliteTaharahRepository Repo, SecurityService Sec, string DbPath) CreateEnv()
    {
        string tempDb = Path.Combine(Path.GetTempPath(), $"taharah_crypto_test_{Guid.NewGuid():N}.db");
        var sec = new SecurityService();
        var repo = new SqliteTaharahRepository(tempDb, sec);
        repo.InitializeAsync().GetAwaiter().GetResult();
        return (repo, sec, tempDb);
    }

    private static void Cleanup(SqliteTaharahRepository repo, string dbPath)
    {
        repo.Dispose();
        SqliteConnection.ClearAllPools();
        try { if (File.Exists(dbPath)) File.Delete(dbPath); } catch { }
    }

    [Fact]
    public void DeriveDbKey_SamePinAndSalt_ProducesSameKey_DifferentSalt_ProducesDifferentKey()
    {
        var sec = new SecurityService();
        string salt = sec.GenerateDbSalt();
        var key1 = sec.DeriveDbKey("123456", salt);
        var key2 = sec.DeriveDbKey("123456", salt);
        Assert.Equal(key1, key2);

        string otherSalt = sec.GenerateDbSalt();
        var key3 = sec.DeriveDbKey("123456", otherSalt);
        Assert.NotEqual(key1, key3);

        var key4 = sec.DeriveDbKey("654321", salt);
        Assert.NotEqual(key1, key4);
    }

    [Fact]
    public void EncryptDecryptDbBlob_RoundTrips()
    {
        var sec = new SecurityService();
        string salt = sec.GenerateDbSalt();
        var key = sec.DeriveDbKey("1234", salt);

        string plaintext = "{\"20000\":{\"Type\":\"reiyah\",\"Ona\":\"Day\"}}";
        var (iv, data) = sec.EncryptDbBlob(key, plaintext);

        Assert.NotEmpty(iv);
        Assert.NotEmpty(data);
        Assert.DoesNotContain("reiyah", data); // ciphertext must not leak plaintext content

        string decrypted = sec.DecryptDbBlob(key, iv, data);
        Assert.Equal(plaintext, decrypted);
    }

    [Fact]
    public void DecryptDbBlob_WrongKey_Throws()
    {
        var sec = new SecurityService();
        string salt = sec.GenerateDbSalt();
        var rightKey = sec.DeriveDbKey("1234", salt);
        var wrongKey = sec.DeriveDbKey("9999", salt);

        var (iv, data) = sec.EncryptDbBlob(rightKey, "sensitive data");

        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(
            () => sec.DecryptDbBlob(wrongKey, iv, data));
    }

    [Fact]
    public async Task UnlockDatabaseAsync_FirstTime_MigratesPlaintextEventsToEncryptedBlob()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            // Data saved before any PIN exists - plaintext, matching JS parity.
            await repo.SaveEventAsync(20000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day });

            await repo.UnlockDatabaseAsync("1234");

            // Once unlocked, the events are still readable through the same API.
            var events = await repo.GetAllEventsAsync();
            Assert.Single(events);
            Assert.Equal("reiyah", events[20000].Type);

            // And the on-disk blob now exists.
            var blob = await repo.GetSettingAsync("__events_blob__");
            Assert.False(string.IsNullOrEmpty(blob));
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task AfterUnlockAndLock_NewRepositoryInstance_CannotReadEventsWithoutThePin()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            await repo.SaveEventAsync(20000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day });
            await repo.UnlockDatabaseAsync("1234");
            repo.Dispose();

            // A fresh repository instance over the same file, never unlocked this session.
            using var repo2 = new SqliteTaharahRepository(dbPath, sec);
            await repo2.InitializeAsync();
            var events = await repo2.GetAllEventsAsync();

            Assert.Empty(events); // locked - nothing readable without the key
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { if (File.Exists(dbPath)) File.Delete(dbPath); } catch { }
        }
    }

    [Fact]
    public async Task UnlockDatabaseAsync_WrongPin_ThrowsRatherThanReturningEmptyOrWrongData()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            await repo.SaveEventAsync(20000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day });
            await repo.UnlockDatabaseAsync("1234");
            repo.LockDatabase();

            await Assert.ThrowsAnyAsync<System.Security.Cryptography.CryptographicException>(
                () => repo.UnlockDatabaseAsync("9999"));
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task RekeyDatabaseAsync_OldPinNoLongerUnlocks_NewPinDoes()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            await repo.SaveEventAsync(20000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day });
            await repo.UnlockDatabaseAsync("1111");
            await repo.RekeyDatabaseAsync("2222");
            repo.LockDatabase();

            await Assert.ThrowsAnyAsync<System.Security.Cryptography.CryptographicException>(
                () => repo.UnlockDatabaseAsync("1111"));

            await repo.UnlockDatabaseAsync("2222");
            var events = await repo.GetAllEventsAsync();
            Assert.Single(events);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task RemoveDatabaseEncryptionAsync_DecryptsBackToPlaintext_ReadableWithoutAnyKey()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            await repo.SaveEventAsync(20000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Day });
            await repo.UnlockDatabaseAsync("1234");

            await repo.RemoveDatabaseEncryptionAsync();

            var blob = await repo.GetSettingAsync("__events_blob__");
            Assert.True(string.IsNullOrEmpty(blob));

            // Readable again with no key at all - "no PIN = no encryption" parity restored.
            var events = await repo.GetAllEventsAsync();
            Assert.Single(events);
            Assert.Equal("reiyah", events[20000].Type);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }

    [Fact]
    public async Task SaveEventAsync_WhileUnlocked_PersistsThroughLockAndUnlockCycle()
    {
        var (repo, sec, dbPath) = CreateEnv();
        try
        {
            await repo.UnlockDatabaseAsync("1234"); // no prior data - first-time activation with an empty db
            await repo.SaveEventAsync(30000, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night });
            repo.LockDatabase();

            Assert.Empty(await repo.GetAllEventsAsync());

            await repo.UnlockDatabaseAsync("1234");
            var events = await repo.GetAllEventsAsync();
            Assert.Single(events);
            Assert.Equal(OnaType.Night, events[30000].Ona);
        }
        finally
        {
            Cleanup(repo, dbPath);
        }
    }
}
