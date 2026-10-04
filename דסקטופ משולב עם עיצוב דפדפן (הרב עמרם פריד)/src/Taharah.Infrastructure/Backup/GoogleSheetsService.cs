using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Taharah.Core.Algorithms;
using static Taharah.Core.Algorithms.VesetEngine;

namespace Taharah.Infrastructure.Backup;

/// <summary>
/// Google Sheets backup, I/O half - ported from js/googleBackup.js's network functions
/// (findExistingSpreadsheet/formatBackupSheet/maybeCreateSpreadsheet/performBackup/
/// fetchBackup). The pure row-building/parsing logic (BuildPayload/ParseBackupRows/
/// MergeDb) lives in GoogleBackupManager (Taharah.Core-adjacent, but placed in
/// Infrastructure because CalendarDayEntry itself is a VesetEngine type) - this class is
/// a thin layer of actual HTTP calls on top of it, using the access token
/// GoogleOAuthService already manages.
///
/// Known, disclosed gap vs. js/googleBackup.js: the "היסטוריה" (history/restore-points)
/// tab - an append-only change log that lets a deleted event be recovered even after a
/// later backup overwrote the main tab - is not implemented here. A backup here always
/// writes the CURRENT full snapshot to the "Backup" tab only. See MIGRATION_PROGRESS.md.
/// </summary>
public sealed class GoogleSheetsService(GoogleOAuthService oauth)
{
    private const string SheetsApi = "https://sheets.googleapis.com/v4/spreadsheets/";
    private const string DriveFilesApi = "https://www.googleapis.com/drive/v3/files";
    private const string SpreadsheetTitle = "לוח טהרת המשפחה - גיבוי";
    private const string LastColumn = "L";

    private static readonly string[] HeaderRow =
    [
        "מספר סידורי", "תאריך עברי", "תאריך לועזי", "מזהה פנימי",
        "סוג אירוע", "עונה", "הערה",
        "סימוני יום / קוד גיבוי", "אימייל שחזור",
        "סיבת הראייה", "משך (ימים)", "מיחוש גופני (וסת הגוף)"
    ];

    private static HttpClient NewClient(string token)
    {
        var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    /// <summary>
    /// Finds a backup spreadsheet this app has already created. The drive.file scope only
    /// ever exposes files the app itself created, so a name search can never surface a
    /// spreadsheet belonging to the user.
    /// </summary>
    private static async Task<string?> FindExistingSpreadsheetAsync(HttpClient http)
    {
        try
        {
            string q = $"mimeType='application/vnd.google-apps.spreadsheet' and name='{SpreadsheetTitle}' and trashed=false";
            string url = $"{DriveFilesApi}?q={Uri.EscapeDataString(q)}&orderBy=createdTime desc&fields=files(id)&pageSize=10";
            var res = await http.GetAsync(url);
            if (!res.IsSuccessStatusCode) return null;
            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            if (!data.TryGetProperty("files", out var files)) return null;
            foreach (var f in files.EnumerateArray())
            {
                if (f.TryGetProperty("id", out var idEl)) return idEl.GetString();
            }
            return null;
        }
        catch
        {
            return null; // listing is best-effort; creating a new file still works
        }
    }

    /// <summary>Cosmetic layout of a freshly created sheet: rename to "Backup", header styling and the header row itself. The rename is essential - every range used elsewhere is "Backup!..." - so it is not swallowed; the styling that follows is best-effort only.</summary>
    private static async Task FormatBackupSheetAsync(HttpClient http, string sheetId)
    {
        var renameBody = new JsonObject
        {
            ["requests"] = new JsonArray
            {
                new JsonObject
                {
                    ["updateSheetProperties"] = new JsonObject
                    {
                        ["properties"] = new JsonObject { ["sheetId"] = 0, ["title"] = "Backup" },
                        ["fields"] = "title"
                    }
                }
            }
        };
        var renameRes = await http.PostAsJsonAsync($"{SheetsApi}{sheetId}:batchUpdate", renameBody);
        if (!renameRes.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"rename_sheet_failed_{(int)renameRes.StatusCode}");
        }

        try
        {
            var headerValues = new JsonArray(HeaderRow.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray());
            var styleBody = new JsonObject
            {
                ["requests"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["updateSheetProperties"] = new JsonObject
                        {
                            ["properties"] = new JsonObject
                            {
                                ["sheetId"] = 0,
                                ["gridProperties"] = new JsonObject { ["frozenRowCount"] = 1, ["columnCount"] = HeaderRow.Length }
                            },
                            ["fields"] = "gridProperties.frozenRowCount,gridProperties.columnCount"
                        }
                    },
                    new JsonObject
                    {
                        ["repeatCell"] = new JsonObject
                        {
                            ["range"] = new JsonObject { ["sheetId"] = 0, ["startRowIndex"] = 0, ["endRowIndex"] = 1 },
                            ["cell"] = new JsonObject
                            {
                                ["userEnteredFormat"] = new JsonObject
                                {
                                    ["backgroundColor"] = new JsonObject { ["red"] = 0.31, ["green"] = 0.27, ["blue"] = 0.9 },
                                    ["textFormat"] = new JsonObject
                                    {
                                        ["foregroundColor"] = new JsonObject { ["red"] = 1, ["green"] = 1, ["blue"] = 1 },
                                        ["fontSize"] = 11,
                                        ["bold"] = true
                                    },
                                    ["horizontalAlignment"] = "CENTER"
                                }
                            },
                            ["fields"] = "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
                        }
                    },
                    new JsonObject
                    {
                        ["autoResizeDimensions"] = new JsonObject
                        {
                            ["dimensions"] = new JsonObject { ["sheetId"] = 0, ["dimension"] = "COLUMNS", ["startIndex"] = 0, ["endIndex"] = HeaderRow.Length }
                        }
                    },
                    new JsonObject
                    {
                        ["updateCells"] = new JsonObject
                        {
                            ["range"] = new JsonObject { ["sheetId"] = 0, ["startRowIndex"] = 0, ["endRowIndex"] = 1, ["startColumnIndex"] = 0, ["endColumnIndex"] = HeaderRow.Length },
                            ["rows"] = new JsonArray
                            {
                                new JsonObject
                                {
                                    ["values"] = new JsonArray(HeaderRow.Select(v => (JsonNode)new JsonObject { ["userEnteredValue"] = new JsonObject { ["stringValue"] = v } }).ToArray())
                                }
                            },
                            ["fields"] = "userEnteredValue"
                        }
                    }
                }
            };
            var batchRes = await http.PostAsJsonAsync($"{SheetsApi}{sheetId}:batchUpdate", styleBody);
            if (!batchRes.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"format_sheet_failed_{(int)batchRes.StatusCode}");
            }

            var headerReq = new HttpRequestMessage(HttpMethod.Put,
                $"{SheetsApi}{sheetId}/values/Backup!A1:{LastColumn}1?valueInputOption=USER_ENTERED")
            {
                Content = JsonContent.Create(new JsonObject { ["values"] = new JsonArray { headerValues } })
            };
            var headerRes = await http.SendAsync(headerReq);
            if (!headerRes.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"header_write_failed_{(int)headerRes.StatusCode}");
            }
        }
        catch
        {
            // Cosmetic formatting must never cost the user a backup - the rename above is
            // what actually matters and has already succeeded by this point.
        }
    }

    /// <summary>Returns the backup spreadsheet's id, reusing one the app already created (persisted meta first, then a Drive lookup, then creating fresh).</summary>
    private async Task<string> MaybeCreateSpreadsheetAsync(HttpClient http)
    {
        var status = await oauth.GetStatusAsync();
        if (!string.IsNullOrEmpty(status.SheetId)) return status.SheetId;

        string? sheetId = await FindExistingSpreadsheetAsync(http);

        if (string.IsNullOrEmpty(sheetId))
        {
            var createBody = new JsonObject { ["properties"] = new JsonObject { ["title"] = SpreadsheetTitle } };
            var res = await http.PostAsJsonAsync(SheetsApi, createBody);
            if (!res.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"create_sheet_failed_{(int)res.StatusCode}");
            }
            var created = await res.Content.ReadFromJsonAsync<JsonElement>();
            sheetId = created.GetProperty("spreadsheetId").GetString();
        }

        // Persist the id BEFORE formatting: if the cosmetic step fails, the next attempt
        // reuses this sheet instead of creating yet another orphan spreadsheet.
        await oauth.SetMetaAsync(new Dictionary<string, string> { ["sheetId"] = sheetId! });

        try
        {
            await FormatBackupSheetAsync(http, sheetId!);
        }
        catch
        {
            // A rename failure here just means the next backup attempt retries formatting
            // against the same (already persisted) sheet id.
        }

        return sheetId!;
    }

    /// <summary>Writes a full snapshot backup: clears the previous rows, then appends the current db + credential row.</summary>
    public async Task BackupNowAsync(Dictionary<int, CalendarDayEntry> db, string pinPlain, string recoveryEmail)
    {
        string? token = await oauth.EnsureFreshTokenAsync();
        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException("no_token");
        }

        using var http = NewClient(token);
        string sheetId = await MaybeCreateSpreadsheetAsync(http);

        var rows = GoogleBackupManager.BuildPayload(db, pinPlain, recoveryEmail);

        var clearRes = await http.PostAsync($"{SheetsApi}{sheetId}/values/Backup!A2:{LastColumn}100000:clear", new StringContent("{}"));
        if (!clearRes.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"clear_failed_{(int)clearRes.StatusCode}");
        }

        var appendBody = new JsonObject { ["values"] = new JsonArray(rows.Select(row => (JsonNode)new JsonArray(row.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray())).ToArray()) };
        var appendRes = await http.PostAsJsonAsync(
            $"{SheetsApi}{sheetId}/values/Backup!A2:{LastColumn}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
            appendBody);
        if (!appendRes.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"append_failed_{(int)appendRes.StatusCode}");
        }

        await oauth.SetMetaAsync(new Dictionary<string, string> { ["lastBackupAt"] = DateTime.UtcNow.ToString("o") });
    }

    /// <summary>Downloads the backup sheet and returns the parsed db + credential row, for the settings-screen "restore" and the lock-screen "forgot PIN" alternative alike.</summary>
    public async Task<(Dictionary<int, CalendarDayEntry> Db, string Pin, string RecoveryEmail)> FetchBackupAsync()
    {
        var status = await oauth.GetStatusAsync();
        if (string.IsNullOrEmpty(status.SheetId))
        {
            throw new InvalidOperationException("no_sheet");
        }

        string? token = await oauth.EnsureFreshTokenAsync();
        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException("no_token");
        }

        using var http = NewClient(token);
        var res = await http.GetAsync($"{SheetsApi}{status.SheetId}/values/Backup!A2:{LastColumn}100000?majorDimension=ROWS");
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"read_failed_{(int)res.StatusCode}");
        }

        var data = await res.Content.ReadFromJsonAsync<JsonElement>();
        var rows = new List<List<string>>();
        if (data.TryGetProperty("values", out var values))
        {
            foreach (var row in values.EnumerateArray())
            {
                rows.Add(row.EnumerateArray().Select(c => c.GetString() ?? "").ToList());
            }
        }

        return GoogleBackupManager.ParseBackupRows(rows);
    }
}
