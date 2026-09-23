using System.Net.Http.Json;
using System.Text.Json;
using Taharah.Core.Algorithms;

namespace Taharah.Infrastructure.Backup;

public sealed class EmailExportResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Sends the data-export payload (Taharah.Core.Algorithms.EmailExportManager) to the user's
/// own chosen email address via FormSubmit.co - ported from js/app.js's
/// sendEmailViaFormSubmit. This relays through a third-party service (formsubmit.co), exactly
/// as the original JS app does; the recipient is always an address the user herself typed in,
/// never one the app chooses. First-time use of a new recipient address requires that address
/// to click an "Activate" link FormSubmit emails it, before the data actually arrives - the
/// same one-time step the JS app's users already go through.
/// </summary>
public sealed class EmailExportService
{
    private const string FormSubmitBaseUrl = "https://formsubmit.co/ajax/";

    public async Task<EmailExportResult> SendAsync(string recipientEmail, List<(string Key, string Value)> payload, CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, string>();
        foreach (var (key, value) in payload)
        {
            body[key] = value;
        }

        try
        {
            using var http = new HttpClient();
            var res = await http.PostAsJsonAsync(FormSubmitBaseUrl + Uri.EscapeDataString(recipientEmail), body, cancellationToken);
            var result = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);
            bool success = result.TryGetProperty("success", out var successEl) && successEl.GetString() == "true";

            return new EmailExportResult
            {
                Success = success,
                Message = success
                    ? "הנתונים נשלחו בהצלחה לשרת! שים לב: אם זו הפעם הראשונה שאתה שולח לכתובת זו, חובה להיכנס כעת למייל וללחוץ על 'Activate' בהודעה מ-FormSubmit כדי שהנתונים יתקבלו בפועל."
                    : "אירעה שגיאה בשליחה. אנא נסה שוב."
            };
        }
        catch (Exception)
        {
            return new EmailExportResult { Success = false, Message = "שגיאת תקשורת. ודא שאתה מחובר לאינטרנט." };
        }
    }
}
