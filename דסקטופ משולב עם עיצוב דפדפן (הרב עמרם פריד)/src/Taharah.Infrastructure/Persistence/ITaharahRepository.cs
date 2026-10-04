using Taharah.Infrastructure.Backup;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Infrastructure.Persistence;

public interface ITaharahRepository
{
    Task InitializeAsync();
    Task<Dictionary<int, CalendarDayEntry>> GetAllEventsAsync();
    Task<CalendarDayEntry?> GetEventAsync(int abs);
    Task SaveEventAsync(int abs, CalendarDayEntry entry);
    Task DeleteEventAsync(int abs);
    Task SaveEventsBatchAsync(Dictionary<int, CalendarDayEntry> events);
    Task<string?> GetSettingAsync(string key);
    Task SaveSettingAsync(string key, string value);
    Task DeleteSettingAsync(string key);
    Task WipeAllAsync();
    Task LogHistoryAsync(string ts, int abs, string action, CalendarDayEntry? entry);
    Task<List<HistoryRow>> GetHistoryRowsAsync();

    /// <summary>
    /// Derives the database encryption key from the (already PIN-verified) PIN and either
    /// decrypts the existing encrypted events blob, or - the first time a PIN is set -
    /// migrates whatever plaintext events already exist into a freshly encrypted one.
    /// Mirrors js/storage.js unlockDatabase.
    /// </summary>
    Task UnlockDatabaseAsync(string pin);

    /// <summary>Re-encrypts the already-unlocked in-memory events under a fresh salt/key derived from a new PIN. Mirrors js/storage.js rekeyDatabase.</summary>
    Task RekeyDatabaseAsync(string newPin);

    /// <summary>Decrypts the already-unlocked in-memory events back into the plaintext table and deletes the encrypted blob - the "no PIN = no encryption" state.</summary>
    Task RemoveDatabaseEncryptionAsync();

    /// <summary>Clears the in-memory key and decrypted cache (app lock) - events become unreadable again until UnlockDatabaseAsync runs.</summary>
    void LockDatabase();
}
