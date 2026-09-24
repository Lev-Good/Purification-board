using System.Text.Json;
using Taharah.Infrastructure.Persistence;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Infrastructure.Backup;

public static class JsonBackupManager
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public static async Task<string> ExportDatabaseJsonAsync(ITaharahRepository repository)
    {
        var allEvents = await repository.GetAllEventsAsync();
        return JsonSerializer.Serialize(allEvents, JsonOpts);
    }

    public static async Task ExportDatabaseToFileAsync(ITaharahRepository repository, string filePath)
    {
        string json = await ExportDatabaseJsonAsync(repository);
        await File.WriteAllTextAsync(filePath, json);
    }

    public static async Task<(int ImportedCount, bool Success, string? Error)> RestoreDatabaseFromFileAsync(
        ITaharahRepository repository, 
        string filePath, 
        bool wipeExisting = false)
    {
        try
        {
            if (!File.Exists(filePath))
                return (0, false, "הקובץ אינו קיים.");

            string json = await File.ReadAllTextAsync(filePath);
            var parsed = JsonSerializer.Deserialize<Dictionary<int, CalendarDayEntry>>(json, JsonOpts);
            if (parsed == null)
                return (0, false, "מבנה הקובץ אינו תקין.");

            if (wipeExisting)
            {
                await repository.WipeAllAsync();
            }

            await repository.SaveEventsBatchAsync(parsed);
            return (parsed.Count, true, null);
        }
        catch (Exception ex)
        {
            return (0, false, $"שגיאה בשחזור: {ex.Message}");
        }
    }
}
