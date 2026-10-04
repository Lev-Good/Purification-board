using System.Text.Json;
using Microsoft.Data.Sqlite;
using Taharah.Core.Enums;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Security;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Infrastructure.Persistence;

/// <summary>Envelope for the encrypted events blob (settings key "__events_blob__") - mirrors js/storage.js's on-disk shape {v, salt, iv, data}.</summary>
internal sealed class EventsBlobEnvelope
{
    public int V { get; set; } = 2;
    public string Salt { get; set; } = string.Empty;
    public string Iv { get; set; } = string.Empty;
    public string Data { get; set; } = string.Empty;
}

public sealed class SqliteTaharahRepository : ITaharahRepository, IDisposable
{
    private const string EventsBlobKey = "__events_blob__";

    private readonly string _connectionString;
    private readonly ISecurityService _securityService;
    private SqliteConnection? _connection;
    private readonly SemaphoreSlim _lock = new(1, 1);

    // The events database is encrypted at rest once a PIN exists (AES-GCM-256, key derived
    // from the PIN - Taharah.Infrastructure.Security.SecurityService). The plaintext copy
    // exists only in memory, for the duration of an unlocked session; the key itself is
    // never persisted. Before any PIN is ever set (or after it is removed) events live in
    // the plain `events` table exactly as before - this mirrors js/storage.js exactly:
    // "no PIN = no encryption" is not a bug, it is the documented behavior of the original
    // app too.
    private byte[]? _dbKey;
    private string? _dbSalt;
    private Dictionary<int, CalendarDayEntry>? _cachedEvents;

    public SqliteTaharahRepository(string dbPath, ISecurityService? securityService = null)
    {
        var dir = Path.GetDirectoryName(dbPath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate
        };
        _connectionString = builder.ToString();
        _securityService = securityService ?? new SecurityService();
    }

    private async Task<SqliteConnection> GetOpenConnectionAsync()
    {
        if (_connection == null)
        {
            _connection = new SqliteConnection(_connectionString);
            await _connection.OpenAsync();
        }
        else if (_connection.State != System.Data.ConnectionState.Open)
        {
            await _connection.OpenAsync();
        }
        return _connection;
    }

    public async Task InitializeAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS events (
                    abs INTEGER PRIMARY KEY,
                    type TEXT NOT NULL,
                    ona TEXT NOT NULL,
                    duration_days INTEGER,
                    kind TEXT,
                    closed_fountain INTEGER,
                    note TEXT,
                    depth TEXT,
                    twice INTEGER,
                    signs_json TEXT,
                    marks_json TEXT,
                    check_parts_json TEXT,
                    standalone_sign INTEGER,
                    safek_ona INTEGER,
                    sign_certainty TEXT,
                    blood_found INTEGER
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS history_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    abs INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    entry_json TEXT
                );
            ";
            await cmd.ExecuteNonQueryAsync();

            // Ensure schema migration for older databases
            var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var pragmaCmd = conn.CreateCommand())
            {
                pragmaCmd.CommandText = "PRAGMA table_info(events);";
                using var pragmaReader = await pragmaCmd.ExecuteReaderAsync();
                while (await pragmaReader.ReadAsync())
                {
                    existingColumns.Add(pragmaReader.GetString(1));
                }
            }

            if (!existingColumns.Contains("sign_certainty"))
            {
                using var alterCmd = conn.CreateCommand();
                alterCmd.CommandText = "ALTER TABLE events ADD COLUMN sign_certainty TEXT;";
                await alterCmd.ExecuteNonQueryAsync();
            }

            if (!existingColumns.Contains("blood_found"))
            {
                using var alterCmd = conn.CreateCommand();
                alterCmd.CommandText = "ALTER TABLE events ADD COLUMN blood_found INTEGER;";
                await alterCmd.ExecuteNonQueryAsync();
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    // ---------- Encryption lifecycle ----------

    public async Task UnlockDatabaseAsync(string pin)
    {
        string? blobJson = await GetSettingAsync(EventsBlobKey);
        if (!string.IsNullOrEmpty(blobJson))
        {
            var envelope = JsonSerializer.Deserialize<EventsBlobEnvelope>(blobJson)
                ?? throw new InvalidOperationException("Malformed encrypted events blob.");
            byte[] key = _securityService.DeriveDbKey(pin, envelope.Salt);
            // Throws (GCM auth-tag mismatch) on a wrong PIN or corrupted data - the caller
            // (the UI) must not treat that as "empty database". In practice the UI only
            // calls this after VerifyPin has already confirmed the PIN is correct.
            string plaintext = _securityService.DecryptDbBlob(key, envelope.Iv, envelope.Data);
            _cachedEvents = JsonSerializer.Deserialize<Dictionary<int, CalendarDayEntry>>(plaintext) ?? [];
            _dbKey = key;
            _dbSalt = envelope.Salt;
            return;
        }

        // First unlock ever with a PIN: whatever is in the plaintext table (a brand new
        // install, or data that predates this encryption) is migrated once, then the
        // plaintext copy is cleared.
        var legacy = await GetAllEventsFromPlaintextTableAsync();
        string salt = _securityService.GenerateDbSalt();
        byte[] newKey = _securityService.DeriveDbKey(pin, salt);
        _cachedEvents = legacy;
        _dbKey = newKey;
        _dbSalt = salt;
        await PersistEncryptedBlobAsync();
        await ClearPlaintextEventsTableAsync();
    }

    public async Task RekeyDatabaseAsync(string newPin)
    {
        // Only valid on an already-unlocked session (the UI only reaches "change PIN" from
        // inside the settings screen, which is unreachable while locked).
        _cachedEvents ??= await GetAllEventsFromPlaintextTableAsync();
        string salt = _securityService.GenerateDbSalt();
        _dbKey = _securityService.DeriveDbKey(newPin, salt);
        _dbSalt = salt;
        await PersistEncryptedBlobAsync();
    }

    public async Task RemoveDatabaseEncryptionAsync()
    {
        var events = _cachedEvents ?? [];
        await SaveEventsToPlaintextTableAsync(events);
        await DeleteSettingAsync(EventsBlobKey);
        _dbKey = null;
        _dbSalt = null;
        _cachedEvents = null;
    }

    public void LockDatabase()
    {
        _dbKey = null;
        _dbSalt = null;
        _cachedEvents = null;
    }

    private async Task PersistEncryptedBlobAsync()
    {
        if (_dbKey == null || _dbSalt == null || _cachedEvents == null)
        {
            throw new InvalidOperationException("Cannot persist an encrypted blob before the database is unlocked.");
        }
        string json = JsonSerializer.Serialize(_cachedEvents);
        var (iv, data) = _securityService.EncryptDbBlob(_dbKey, json);
        string envelopeJson = JsonSerializer.Serialize(new EventsBlobEnvelope { Salt = _dbSalt, Iv = iv, Data = data });
        await SaveSettingAsync(EventsBlobKey, envelopeJson);
    }

    // ---------- Events (branches on whether encryption is active this session) ----------

    public async Task<Dictionary<int, CalendarDayEntry>> GetAllEventsAsync()
    {
        if (_dbKey != null && _cachedEvents != null)
        {
            return new Dictionary<int, CalendarDayEntry>(_cachedEvents);
        }
        return await GetAllEventsFromPlaintextTableAsync();
    }

    public async Task<CalendarDayEntry?> GetEventAsync(int abs)
    {
        if (_dbKey != null && _cachedEvents != null)
        {
            return _cachedEvents.TryGetValue(abs, out var e) ? e : null;
        }

        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM events WHERE abs = @abs;";
            cmd.Parameters.AddWithValue("@abs", abs);

            using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return MapEntryFromReader(reader);
            }
            return null;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveEventAsync(int abs, CalendarDayEntry entry)
    {
        if (_dbKey != null && _cachedEvents != null)
        {
            _cachedEvents[abs] = entry;
            await PersistEncryptedBlobAsync();
            return;
        }

        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO events (abs, type, ona, duration_days, kind, closed_fountain, note, depth, twice, signs_json, marks_json, check_parts_json, standalone_sign, safek_ona, sign_certainty, blood_found)
                VALUES (@abs, @type, @ona, @duration_days, @kind, @closed_fountain, @note, @depth, @twice, @signs_json, @marks_json, @check_parts_json, @standalone_sign, @safek_ona, @sign_certainty, @blood_found)
                ON CONFLICT(abs) DO UPDATE SET
                    type = excluded.type,
                    ona = excluded.ona,
                    duration_days = excluded.duration_days,
                    kind = excluded.kind,
                    closed_fountain = excluded.closed_fountain,
                    note = excluded.note,
                    depth = excluded.depth,
                    twice = excluded.twice,
                    signs_json = excluded.signs_json,
                    marks_json = excluded.marks_json,
                    check_parts_json = excluded.check_parts_json,
                    standalone_sign = excluded.standalone_sign,
                    safek_ona = excluded.safek_ona,
                    sign_certainty = excluded.sign_certainty,
                    blood_found = excluded.blood_found;
            ";
            BindEntryParameters(cmd, abs, entry);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task DeleteEventAsync(int abs)
    {
        if (_dbKey != null && _cachedEvents != null)
        {
            _cachedEvents.Remove(abs);
            await PersistEncryptedBlobAsync();
            return;
        }

        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM events WHERE abs = @abs;";
            cmd.Parameters.AddWithValue("@abs", abs);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveEventsBatchAsync(Dictionary<int, CalendarDayEntry> events)
    {
        if (_dbKey != null && _cachedEvents != null)
        {
            foreach (var kv in events) _cachedEvents[kv.Key] = kv.Value;
            await PersistEncryptedBlobAsync();
            return;
        }

        await SaveEventsToPlaintextTableAsync(events);
    }

    private async Task<Dictionary<int, CalendarDayEntry>> GetAllEventsFromPlaintextTableAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM events ORDER BY abs ASC;";

            var db = new Dictionary<int, CalendarDayEntry>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                int abs = reader.GetInt32(0);
                var entry = MapEntryFromReader(reader);
                db[abs] = entry;
            }
            return db;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task SaveEventsToPlaintextTableAsync(Dictionary<int, CalendarDayEntry> events)
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var tx = conn.BeginTransaction();
            foreach (var kv in events)
            {
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    INSERT INTO events (abs, type, ona, duration_days, kind, closed_fountain, note, depth, twice, signs_json, marks_json, check_parts_json, standalone_sign, safek_ona, sign_certainty, blood_found)
                    VALUES (@abs, @type, @ona, @duration_days, @kind, @closed_fountain, @note, @depth, @twice, @signs_json, @marks_json, @check_parts_json, @standalone_sign, @safek_ona, @sign_certainty, @blood_found)
                    ON CONFLICT(abs) DO UPDATE SET
                        type = excluded.type,
                        ona = excluded.ona,
                        duration_days = excluded.duration_days,
                        kind = excluded.kind,
                        closed_fountain = excluded.closed_fountain,
                        note = excluded.note,
                        depth = excluded.depth,
                        twice = excluded.twice,
                        signs_json = excluded.signs_json,
                        marks_json = excluded.marks_json,
                        check_parts_json = excluded.check_parts_json,
                        standalone_sign = excluded.standalone_sign,
                        safek_ona = excluded.safek_ona,
                        sign_certainty = excluded.sign_certainty,
                        blood_found = excluded.blood_found;
                ";
                BindEntryParameters(cmd, kv.Key, kv.Value);
                await cmd.ExecuteNonQueryAsync();
            }
            tx.Commit();
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task ClearPlaintextEventsTableAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM events;";
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    // ---------- Settings / history (never encrypted - matches js/storage.js scope: only the events db is) ----------

    public async Task<string?> GetSettingAsync(string key)
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT value FROM settings WHERE key = @key;";
            cmd.Parameters.AddWithValue("@key", key);
            var result = await cmd.ExecuteScalarAsync();
            return result?.ToString();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveSettingAsync(string key, string value)
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO settings (key, value) VALUES (@key, @value)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            ";
            cmd.Parameters.AddWithValue("@key", key);
            cmd.Parameters.AddWithValue("@value", value);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task DeleteSettingAsync(string key)
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM settings WHERE key = @key;";
            cmd.Parameters.AddWithValue("@key", key);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task WipeAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                DELETE FROM events;
                DELETE FROM settings;
                DELETE FROM history_log;
            ";
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
        _dbKey = null;
        _dbSalt = null;
        _cachedEvents = null;
    }

    public async Task LogHistoryAsync(string ts, int abs, string action, CalendarDayEntry? entry)
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO history_log (ts, abs, action, entry_json)
                VALUES (@ts, @abs, @action, @entry_json);
            ";
            cmd.Parameters.AddWithValue("@ts", ts);
            cmd.Parameters.AddWithValue("@abs", abs);
            cmd.Parameters.AddWithValue("@action", action);
            cmd.Parameters.AddWithValue("@entry_json", entry != null ? (object)JsonSerializer.Serialize(entry) : DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<HistoryRow>> GetHistoryRowsAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var conn = await GetOpenConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT ts, abs, action, entry_json FROM history_log ORDER BY id ASC;";

            var list = new List<HistoryRow>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                string ts = reader.GetString(0);
                int abs = reader.GetInt32(1);
                string action = reader.GetString(2);
                CalendarDayEntry? entry = null;
                if (!reader.IsDBNull(3))
                {
                    try
                    {
                        entry = JsonSerializer.Deserialize<CalendarDayEntry>(reader.GetString(3));
                    }
                    catch
                    {
                        // Ignore malformed json
                    }
                }

                list.Add(new HistoryRow { Ts = ts, Abs = abs, Action = action, Entry = entry });
            }
            return list;
        }
        finally
        {
            _lock.Release();
        }
    }

    private static CalendarDayEntry MapEntryFromReader(SqliteDataReader reader)
    {
        var entry = new CalendarDayEntry
        {
            Type = reader.GetString(1),
            Ona = Enum.TryParse<OnaType>(reader.GetString(2), out var ona) ? ona : OnaType.Day,
            DurationDays = reader.FieldCount > 3 && !reader.IsDBNull(3) ? reader.GetInt32(3) : null,
            Kind = reader.FieldCount > 4 && !reader.IsDBNull(4) ? reader.GetString(4) : null,
            ClosedFountain = reader.FieldCount > 5 && !reader.IsDBNull(5) ? reader.GetInt32(5) == 1 : null,
            Note = reader.FieldCount > 6 && !reader.IsDBNull(6) ? reader.GetString(6) : "",
            Depth = reader.FieldCount > 7 && !reader.IsDBNull(7) ? reader.GetString(7) : null,
            Twice = reader.FieldCount > 8 && !reader.IsDBNull(8) ? reader.GetInt32(8) == 1 : null,
            Signs = reader.FieldCount > 9 && !reader.IsDBNull(9) ? (JsonSerializer.Deserialize<List<string>>(reader.GetString(9)) ?? []) : [],
            Marks = reader.FieldCount > 10 && !reader.IsDBNull(10) ? (JsonSerializer.Deserialize<List<string>>(reader.GetString(10)) ?? []) : [],
            CheckParts = reader.FieldCount > 11 && !reader.IsDBNull(11) ? (JsonSerializer.Deserialize<List<string>>(reader.GetString(11)) ?? []) : [],
            StandaloneSign = reader.FieldCount > 12 && !reader.IsDBNull(12) && reader.GetInt32(12) == 1,
            SafekOna = reader.FieldCount > 13 && !reader.IsDBNull(13) && reader.GetInt32(13) == 1,
            SignCertainty = reader.FieldCount > 14 && !reader.IsDBNull(14) ? reader.GetString(14) : null,
            BloodFound = reader.FieldCount > 15 && !reader.IsDBNull(15) ? (reader.GetInt32(15) == 1) : null
        };
        return entry;
    }

    private static void BindEntryParameters(SqliteCommand cmd, int abs, CalendarDayEntry entry)
    {
        cmd.Parameters.AddWithValue("@abs", abs);
        cmd.Parameters.AddWithValue("@type", entry.Type);
        cmd.Parameters.AddWithValue("@ona", entry.Ona.ToString());
        cmd.Parameters.AddWithValue("@duration_days", entry.DurationDays.HasValue ? (object)entry.DurationDays.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@kind", (object?)entry.Kind ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@closed_fountain", entry.ClosedFountain.HasValue ? (entry.ClosedFountain.Value ? 1 : 0) : DBNull.Value);
        cmd.Parameters.AddWithValue("@note", entry.Note ?? "");
        cmd.Parameters.AddWithValue("@depth", (object?)entry.Depth ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@twice", entry.Twice.HasValue ? (entry.Twice.Value ? 1 : 0) : DBNull.Value);
        cmd.Parameters.AddWithValue("@signs_json", JsonSerializer.Serialize(entry.Signs));
        cmd.Parameters.AddWithValue("@marks_json", JsonSerializer.Serialize(entry.Marks));
        cmd.Parameters.AddWithValue("@check_parts_json", JsonSerializer.Serialize(entry.CheckParts));
        cmd.Parameters.AddWithValue("@standalone_sign", entry.StandaloneSign ? 1 : 0);
        cmd.Parameters.AddWithValue("@safek_ona", entry.SafekOna ? 1 : 0);
        cmd.Parameters.AddWithValue("@sign_certainty", (object?)entry.SignCertainty ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@blood_found", entry.BloodFound.HasValue ? (entry.BloodFound.Value ? 1 : 0) : DBNull.Value);
    }

    public void Dispose()
    {
        _connection?.Dispose();
        _lock.Dispose();
    }
}

