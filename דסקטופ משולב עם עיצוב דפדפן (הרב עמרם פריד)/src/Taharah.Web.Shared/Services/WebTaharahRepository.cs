using System.Text.Json;
using Microsoft.JSInterop;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Web.Shared.Services;

/// <summary>
/// Implements ITaharahRepository for Web / Blazor WebAssembly environments.
/// All user data is encrypted locally using AES-GCM-256 via Web Crypto API in browser.
/// Zero remote server dependency, 100% private.
/// </summary>
public sealed class WebTaharahRepository : ITaharahRepository
{
    private readonly IJSRuntime _js;
    private Dictionary<int, CalendarDayEntry> _cache = [];
    private Dictionary<string, string> _settings = [];
    private string _currentPin = "default_local_vault_key";
    private bool _isLocked;

    public WebTaharahRepository(IJSRuntime js)
    {
        _js = js;
    }

    public async Task InitializeAsync()
    {
        try
        {
            var rawJson = await _js.InvokeAsync<string?>("taharahInterop.loadEncrypted", "events_db", _currentPin);
            if (!string.IsNullOrEmpty(rawJson))
            {
                var dict = JsonSerializer.Deserialize<Dictionary<int, CalendarDayEntry>>(rawJson);
                if (dict != null) _cache = dict;
            }

            var settingsJson = await _js.InvokeAsync<string?>("taharahInterop.loadEncrypted", "settings_db", _currentPin);
            if (!string.IsNullOrEmpty(settingsJson))
            {
                var sDict = JsonSerializer.Deserialize<Dictionary<string, string>>(settingsJson);
                if (sDict != null) _settings = sDict;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WebTaharahRepository] Init note: {ex.Message}");
        }
    }

    public Task<Dictionary<int, CalendarDayEntry>> GetAllEventsAsync()
    {
        if (_isLocked) return Task.FromResult(new Dictionary<int, CalendarDayEntry>());
        return Task.FromResult(new Dictionary<int, CalendarDayEntry>(_cache));
    }

    public Task<CalendarDayEntry?> GetEventAsync(int abs)
    {
        if (_isLocked) return Task.FromResult<CalendarDayEntry?>(null);
        _cache.TryGetValue(abs, out var entry);
        return Task.FromResult(entry);
    }

    public async Task SaveEventAsync(int abs, CalendarDayEntry entry)
    {
        _cache[abs] = entry.Clone();
        await PersistAsync();
    }

    public async Task DeleteEventAsync(int abs)
    {
        if (_cache.Remove(abs))
        {
            await PersistAsync();
        }
    }

    public async Task SaveEventsBatchAsync(Dictionary<int, CalendarDayEntry> events)
    {
        foreach (var kvp in events)
        {
            _cache[kvp.Key] = kvp.Value.Clone();
        }
        await PersistAsync();
    }

    public Task<string?> GetSettingAsync(string key)
    {
        _settings.TryGetValue(key, out var val);
        return Task.FromResult<string?>(val);
    }

    public async Task SaveSettingAsync(string key, string value)
    {
        _settings[key] = value;
        try
        {
            var json = JsonSerializer.Serialize(_settings);
            await _js.InvokeVoidAsync("taharahInterop.saveEncrypted", "settings_db", json, _currentPin);
        }
        catch { }
    }

    public async Task DeleteSettingAsync(string key)
    {
        if (_settings.Remove(key))
        {
            var json = JsonSerializer.Serialize(_settings);
            await _js.InvokeVoidAsync("taharahInterop.saveEncrypted", "settings_db", json, _currentPin);
        }
    }

    public async Task WipeAllAsync()
    {
        _cache.Clear();
        _settings.Clear();
        await _js.InvokeVoidAsync("taharahInterop.saveEncrypted", "events_db", "{}", _currentPin);
        await _js.InvokeVoidAsync("taharahInterop.saveEncrypted", "settings_db", "{}", _currentPin);
    }

    public Task LogHistoryAsync(string ts, int abs, string action, CalendarDayEntry? entry) => Task.CompletedTask;
    public Task<List<HistoryRow>> GetHistoryRowsAsync() => Task.FromResult(new List<HistoryRow>());

    public async Task UnlockDatabaseAsync(string pin)
    {
        _currentPin = pin;
        _isLocked = false;
        await InitializeAsync();
    }

    public async Task RekeyDatabaseAsync(string newPin)
    {
        _currentPin = newPin;
        await PersistAsync();
    }

    public async Task RemoveDatabaseEncryptionAsync()
    {
        _currentPin = "default_local_vault_key";
        await PersistAsync();
    }

    public void LockDatabase()
    {
        _isLocked = true;
    }

    private async Task PersistAsync()
    {
        try
        {
            var json = JsonSerializer.Serialize(_cache);
            await _js.InvokeVoidAsync("taharahInterop.saveEncrypted", "events_db", json, _currentPin);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WebTaharahRepository] Persist error: {ex.Message}");
        }
    }
}
