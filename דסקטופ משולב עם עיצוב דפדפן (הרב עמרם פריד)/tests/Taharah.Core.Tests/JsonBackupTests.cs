using System.IO;
using Taharah.Core.Enums;
using Taharah.Infrastructure.Backup;
using Taharah.Infrastructure.Persistence;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Core.Tests;

public class JsonBackupTests
{
    [Fact]
    public async Task ExportAndImport_SerializesAndDeserializesCorrectly()
    {
        var tempDbPath = Path.Combine(Path.GetTempPath(), $"taharah_db_test_{Guid.NewGuid():N}.db");
        var tempJsonPath = Path.Combine(Path.GetTempPath(), $"taharah_backup_test_{Guid.NewGuid():N}.json");

        try
        {
            var repo = new SqliteTaharahRepository(tempDbPath);
            await repo.InitializeAsync();
            await repo.SaveEventAsync(100, new CalendarDayEntry { Type = "reiyah", Ona = OnaType.Night });

            // Export to file
            await JsonBackupManager.ExportDatabaseToFileAsync(repo, tempJsonPath);
            Assert.True(File.Exists(tempJsonPath));

            // Create second clean db and restore
            var tempDbPath2 = Path.Combine(Path.GetTempPath(), $"taharah_db_test2_{Guid.NewGuid():N}.db");
            var repo2 = new SqliteTaharahRepository(tempDbPath2);
            await repo2.InitializeAsync();

            var result = await JsonBackupManager.RestoreDatabaseFromFileAsync(repo2, tempJsonPath);
            Assert.True(result.Success);
            Assert.Equal(1, result.ImportedCount);
            Assert.Null(result.Error);

            var entries = await repo2.GetAllEventsAsync();
            Assert.True(entries.ContainsKey(100));
            Assert.Equal("reiyah", entries[100].Type);

            repo.Dispose();
            repo2.Dispose();
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();

            if (File.Exists(tempDbPath2)) File.Delete(tempDbPath2);
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            if (File.Exists(tempDbPath)) File.Delete(tempDbPath);
            if (File.Exists(tempJsonPath)) File.Delete(tempJsonPath);
        }
    }
}
