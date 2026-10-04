using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Models;

namespace Taharah.Infrastructure.Backup;

public sealed class CalendarSyncResult
{
    public bool Ok { get; set; }
    public List<string> Errors { get; set; } = [];
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Deleted { get; set; }
}

/// <summary>
/// Google Calendar sync, I/O half - ported from js/googleCalendar.js's network functions
/// (getOrCreateAppCalendar/fetchExistingAppEvents/createEvent/updateEvent/deleteEvent/
/// syncCalendarNow/clearAllAppEvents). The pure decision logic (what events should exist,
/// what to create/update/delete) lives in GoogleCalendarManager (Taharah.Core.Algorithms) -
/// this class is a thin layer of actual HTTP calls on top of it, using the access token
/// GoogleOAuthService already manages (refresh, encrypted storage).
/// </summary>
public sealed class GoogleCalendarService(GoogleOAuthService oauth)
{
    private const string CalendarApi = "https://www.googleapis.com/calendar/v3/";
    private const string AppTag = "taharah-board";

    private static HttpClient NewClient(string token)
    {
        var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    /// <summary>
    /// Finds the app's calendar by its known id (fast path), or by name among the user's
    /// calendar list (first connection / id lost), or creates it fresh. The id is then
    /// persisted so every later sync skips the lookup entirely.
    /// </summary>
    public async Task<string> GetOrCreateAppCalendarAsync(string token)
    {
        using var http = NewClient(token);

        var status = await oauth.GetStatusAsync();
        if (!string.IsNullOrEmpty(status.CalendarId))
        {
            // Confirm it still exists - the user could have deleted it by hand.
            var check = await http.GetAsync($"{CalendarApi}calendars/{Uri.EscapeDataString(status.CalendarId)}");
            if (check.IsSuccessStatusCode) return status.CalendarId;
        }

        var listRes = await http.GetAsync($"{CalendarApi}users/me/calendarList?minAccessRole=owner");
        if (listRes.IsSuccessStatusCode)
        {
            var list = await listRes.Content.ReadFromJsonAsync<JsonElement>();
            if (list.TryGetProperty("items", out var items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    if (item.TryGetProperty("summary", out var summaryEl) &&
                        summaryEl.GetString() == GoogleCalendarManager.CalendarSummary &&
                        item.TryGetProperty("id", out var idEl))
                    {
                        string foundId = idEl.GetString() ?? "";
                        await oauth.SetMetaAsync(new Dictionary<string, string> { ["calendarId"] = foundId });
                        return foundId;
                    }
                }
            }
        }

        var createBody = new JsonObject
        {
            ["summary"] = GoogleCalendarManager.CalendarSummary,
            ["description"] = "תזכורות בדיקות וימי פרישה מאפליקציית לוח טהרה",
            ["timeZone"] = "Asia/Jerusalem"
        };
        var createRes = await http.PostAsJsonAsync($"{CalendarApi}calendars", createBody);
        if (!createRes.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"calendar_create_failed_{(int)createRes.StatusCode}");
        }
        var created = await createRes.Content.ReadFromJsonAsync<JsonElement>();
        string createdId = created.GetProperty("id").GetString() ?? "";
        await oauth.SetMetaAsync(new Dictionary<string, string> { ["calendarId"] = createdId });
        return createdId;
    }

    /// <summary>Fetches every future event this app tagged in its own calendar, reduced to just what ReconcileEvents needs (id, syncKey, start/end).</summary>
    public async Task<List<ExistingCalendarEvent>> FetchExistingAppEventsAsync(string token, string calendarId)
    {
        using var http = NewClient(token);
        string url = $"{CalendarApi}calendars/{Uri.EscapeDataString(calendarId)}/events"
            + $"?timeMin={Uri.EscapeDataString(DateTime.UtcNow.ToString("o"))}"
            + $"&privateExtendedProperty={Uri.EscapeDataString("app=" + AppTag)}"
            + "&maxResults=2500&singleEvents=true";

        var res = await http.GetAsync(url);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"fetch_events_failed_{(int)res.StatusCode}");
        }

        var data = await res.Content.ReadFromJsonAsync<JsonElement>();
        var result = new List<ExistingCalendarEvent>();
        if (!data.TryGetProperty("items", out var items)) return result;

        foreach (var item in items.EnumerateArray())
        {
            string syncKey = "";
            if (item.TryGetProperty("extendedProperties", out var ext) &&
                ext.TryGetProperty("private", out var priv) &&
                priv.TryGetProperty("syncKey", out var keyEl))
            {
                syncKey = keyEl.GetString() ?? "";
            }
            if (string.IsNullOrEmpty(syncKey)) continue;

            if (!item.TryGetProperty("start", out var startEl) || !startEl.TryGetProperty("dateTime", out var startDt)) continue;
            if (!item.TryGetProperty("end", out var endEl) || !endEl.TryGetProperty("dateTime", out var endDt)) continue;
            if (!item.TryGetProperty("id", out var idEl)) continue;

            result.Add(new ExistingCalendarEvent
            {
                Id = idEl.GetString() ?? "",
                SyncKey = syncKey,
                StartDateTime = DateTime.Parse(startDt.GetString()!).ToUniversalTime(),
                EndDateTime = DateTime.Parse(endDt.GetString()!).ToUniversalTime()
            });
        }
        return result;
    }

    private static JsonObject ToApiPayload(ExpectedCalendarEvent expected, string tzid)
    {
        var overrides = new JsonArray();
        foreach (var r in expected.Reminders)
        {
            overrides.Add(new JsonObject { ["method"] = r.Method, ["minutes"] = r.Minutes });
        }

        return new JsonObject
        {
            ["summary"] = expected.Summary,
            ["description"] = expected.Description,
            ["start"] = new JsonObject { ["dateTime"] = expected.Start.ToString("o"), ["timeZone"] = tzid },
            ["end"] = new JsonObject { ["dateTime"] = expected.End.ToString("o"), ["timeZone"] = tzid },
            ["visibility"] = "private",
            ["transparency"] = "transparent",
            ["reminders"] = new JsonObject { ["useDefault"] = false, ["overrides"] = overrides },
            ["extendedProperties"] = new JsonObject
            {
                ["private"] = new JsonObject
                {
                    ["app"] = AppTag,
                    ["syncKey"] = expected.SyncKey,
                    ["eventType"] = expected.EventType,
                    ["dateAbs"] = expected.DateAbs.ToString()
                }
            }
        };
    }

    private async Task CreateEventAsync(HttpClient http, string calendarId, ExpectedCalendarEvent expected, string tzid)
    {
        var res = await http.PostAsJsonAsync($"{CalendarApi}calendars/{Uri.EscapeDataString(calendarId)}/events", ToApiPayload(expected, tzid));
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"create_event_failed_{(int)res.StatusCode}");
    }

    private async Task UpdateEventAsync(HttpClient http, string calendarId, string id, ExpectedCalendarEvent expected, string tzid)
    {
        var req = new HttpRequestMessage(HttpMethod.Patch,
            $"{CalendarApi}calendars/{Uri.EscapeDataString(calendarId)}/events/{Uri.EscapeDataString(id)}")
        {
            Content = JsonContent.Create(ToApiPayload(expected, tzid))
        };
        var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"update_event_failed_{(int)res.StatusCode}");
    }

    private async Task DeleteEventAsync(HttpClient http, string calendarId, string id)
    {
        var res = await http.DeleteAsync($"{CalendarApi}calendars/{Uri.EscapeDataString(calendarId)}/events/{Uri.EscapeDataString(id)}");
        // 410 Gone / 404 = already deleted (e.g. by hand) - not a failure worth reporting.
        if (!res.IsSuccessStatusCode && res.StatusCode != System.Net.HttpStatusCode.Gone && res.StatusCode != System.Net.HttpStatusCode.NotFound)
        {
            throw new InvalidOperationException($"delete_event_failed_{(int)res.StatusCode}");
        }
    }

    /// <summary>Runs create/update/delete for one reconcile diff, one call at a time (Calendar v3 has no public batch endpoint for these). Each call's own failure is caught and reported rather than aborting the whole sync.</summary>
    private async Task<CalendarSyncResult> ApplyReconcileAsync(string token, string calendarId, CalendarReconcileDiff diff, string tzid)
    {
        using var http = NewClient(token);
        var errors = new List<string>();

        foreach (var expected in diff.ToCreate)
        {
            try { await CreateEventAsync(http, calendarId, expected, tzid); }
            catch (Exception e) { errors.Add(e.Message); }
        }
        foreach (var (id, evt) in diff.ToUpdate)
        {
            try { await UpdateEventAsync(http, calendarId, id, evt, tzid); }
            catch (Exception e) { errors.Add(e.Message); }
        }
        foreach (var id in diff.ToDelete)
        {
            try { await DeleteEventAsync(http, calendarId, id); }
            catch (Exception e) { errors.Add(e.Message); }
        }

        return new CalendarSyncResult
        {
            Ok = errors.Count == 0,
            Errors = errors,
            Created = diff.ToCreate.Count,
            Updated = diff.ToUpdate.Count,
            Deleted = diff.ToDelete.Count
        };
    }

    /// <summary>Full sync: builds the expected list, fetches what actually exists, reconciles, and applies. Returns a summary for the settings-screen toast.</summary>
    public async Task<CalendarSyncResult> SyncCalendarNowAsync(
        Dictionary<int, VesetEngine.CalendarDayEntry> db,
        EngineResult engineResult,
        LocationDef location,
        int todayAbs,
        CalendarSyncSettings settings)
    {
        string? token = await oauth.EnsureFreshTokenAsync();
        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException("no_token");
        }

        string calendarId = await GetOrCreateAppCalendarAsync(token);
        var expected = GoogleCalendarManager.BuildExpectedEvents(db, engineResult, location, todayAbs, settings);
        var existing = await FetchExistingAppEventsAsync(token, calendarId);
        var diff = GoogleCalendarManager.ReconcileEvents(expected, existing);
        var result = await ApplyReconcileAsync(token, calendarId, diff, location.Tzid);

        await oauth.SetMetaAsync(new Dictionary<string, string> { ["calendarLastSyncAt"] = DateTime.UtcNow.ToString("o") });
        return result;
    }

    /// <summary>Deletes every event this app ever created in its calendar (the calendar itself is left in place - only a full disconnect removes it, so re-enabling sync afterward just repopulates it from scratch).</summary>
    public async Task<int> ClearAllAppEventsAsync()
    {
        string? token = await oauth.EnsureFreshTokenAsync();
        if (string.IsNullOrEmpty(token)) return 0;

        var status = await oauth.GetStatusAsync();
        if (string.IsNullOrEmpty(status.CalendarId)) return 0;

        using var http = NewClient(token);
        var existing = await FetchExistingAppEventsAsync(token, status.CalendarId);
        int deleted = 0;
        foreach (var e in existing)
        {
            try { await DeleteEventAsync(http, status.CalendarId, e.Id); deleted++; }
            catch { /* best-effort */ }
        }
        return deleted;
    }
}
