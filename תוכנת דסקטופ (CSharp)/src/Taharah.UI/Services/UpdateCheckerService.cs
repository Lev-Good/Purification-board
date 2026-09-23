using System.Net.Http;
using System.Reflection;
using System.Text.Json;

namespace Taharah.UI.Services;

public record UpdateCheckResult(
    bool IsUpdateAvailable,
    string CurrentVersion,
    string LatestVersion,
    string ReleaseUrl,
    string ReleaseNotes);

public class UpdateCheckerService
{
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    static UpdateCheckerService()
    {
        HttpClient.DefaultRequestHeaders.Add("User-Agent", "Taharah-Desktop-App");
    }

    public async Task<UpdateCheckResult> CheckForUpdatesAsync(string owner = "Lev-Good", string repo = "Purification-board")
    {
        string currentVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";
        string url = $"https://api.github.com/repos/{owner}/{repo}/releases/latest";

        try
        {
            var response = await HttpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return new UpdateCheckResult(false, currentVersion, currentVersion, string.Empty, string.Empty);
            }

            string json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            string tagName = root.TryGetProperty("tag_name", out var tag) ? tag.GetString() ?? "" : "";
            string cleanVersion = tagName.TrimStart('v', 'V');
            string htmlUrl = root.TryGetProperty("html_url", out var link) ? link.GetString() ?? "" : "";
            string body = root.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "";

            bool isNewer = IsVersionNewer(cleanVersion, currentVersion);

            return new UpdateCheckResult(
                IsUpdateAvailable: isNewer,
                CurrentVersion: currentVersion,
                LatestVersion: cleanVersion,
                ReleaseUrl: htmlUrl,
                ReleaseNotes: body);
        }
        catch
        {
            return new UpdateCheckResult(false, currentVersion, currentVersion, string.Empty, string.Empty);
        }
    }

    private static bool IsVersionNewer(string latestStr, string currentStr)
    {
        if (Version.TryParse(latestStr, out var latest) && Version.TryParse(currentStr, out var current))
        {
            return latest > current;
        }
        return false;
    }
}
