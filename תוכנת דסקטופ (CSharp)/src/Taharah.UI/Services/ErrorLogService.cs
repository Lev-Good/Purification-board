using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Taharah.Infrastructure.Persistence;

namespace Taharah.UI.Services;

public sealed class ErrorLogEntry
{
    public string At { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Extra { get; set; } = string.Empty;
}

/// <summary>
/// Automatic bug log - so a crash can be diagnosed remotely without access to the user's
/// machine. Persisted as a ring buffer (max 200 entries) under a single settings key.
/// Ports js/errorLog.js faithfully. Every method here must never throw - a logger that
/// fails can hide the very error it exists to record.
/// </summary>
public sealed class ErrorLogService
{
    private const string SettingKey = "error_log_json";
    private const int MaxEntries = 200;
    private const int MaxMessageLength = 2000;
    private const int MaxExtraLength = 4000;

    private readonly ITaharahRepository _repository;

    public ErrorLogService(ITaharahRepository repository)
    {
        _repository = repository;
    }

    private async Task<List<ErrorLogEntry>> ReadLogAsync()
    {
        try
        {
            var raw = await _repository.GetSettingAsync(SettingKey);
            if (string.IsNullOrEmpty(raw)) return [];
            return JsonSerializer.Deserialize<List<ErrorLogEntry>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private async Task WriteLogAsync(List<ErrorLogEntry> entries)
    {
        try
        {
            var trimmed = entries.Count > MaxEntries
                ? entries.Skip(entries.Count - MaxEntries).ToList()
                : entries;
            await _repository.SaveSettingAsync(SettingKey, JsonSerializer.Serialize(trimmed));
        }
        catch
        {
            // Storage full/locked - logging is best-effort only.
        }
    }

    public async Task LogErrorAsync(string? message, string? extra = null)
    {
        try
        {
            var entries = await ReadLogAsync();
            string msg = message ?? "";
            if (msg.Length > MaxMessageLength) msg = msg[..MaxMessageLength];
            string ex = extra ?? "";
            if (ex.Length > MaxExtraLength) ex = ex[..MaxExtraLength];

            entries.Add(new ErrorLogEntry
            {
                At = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                Message = msg,
                Extra = ex
            });
            await WriteLogAsync(entries);
        }
        catch
        {
            // Never throw from a logging call.
        }
    }

    /// <summary>Synchronous fire-and-forget entry point for exception handlers that cannot await (the process may terminate immediately after).</summary>
    public void LogErrorBlocking(string? message, string? extra = null)
    {
        try
        {
            LogErrorAsync(message, extra).GetAwaiter().GetResult();
        }
        catch
        {
            // Never throw from a logging call - a crash handler must not itself crash.
        }
    }

    public async Task<int> GetErrorLogCountAsync()
    {
        var entries = await ReadLogAsync();
        return entries.Count;
    }

    public async Task ClearErrorLogAsync()
    {
        try
        {
            await _repository.DeleteSettingAsync(SettingKey);
        }
        catch
        {
            // best-effort
        }
    }

    /// <summary>The full downloadable diagnostic text: system info header + every logged entry - exactly what a developer needs to diagnose a bug remotely.</summary>
    public async Task<string> BuildExportTextAsync(string appVersion)
    {
        var entries = await ReadLogAsync();
        var sb = new StringBuilder();
        sb.AppendLine("לוח טהרת המשפחה - קובץ לוג לתקלות");
        sb.AppendLine("========================================");
        sb.AppendLine($"זמן ייצוא: {DateTime.UtcNow:o}");
        sb.AppendLine($"גרסת תוכנה: {appVersion}");
        sb.AppendLine("סוג הפעלה: אפליקציית שולחן עבודה (WPF)");
        sb.AppendLine($"מערכת הפעלה: {RuntimeInformation.OSDescription}");
        sb.AppendLine($"ארכיטקטורה: {RuntimeInformation.OSArchitecture}");
        sb.AppendLine($"שפת מערכת: {CultureInfo.CurrentUICulture.Name}");
        sb.AppendLine();

        string body = entries.Count > 0
            ? string.Join("\n\n", entries.Select(e =>
                $"[{e.At}] {e.Message}" + (string.IsNullOrEmpty(e.Extra) ? "" : "\n" + e.Extra)))
            : "(לא נרשמו תקלות - הקובץ מכיל רק את פרטי המערכת שלמעלה.)";

        sb.AppendLine($"--- יומן תקלות ({entries.Count} רשומות) ---");
        sb.AppendLine();
        sb.Append(body);
        return sb.ToString();
    }
}
