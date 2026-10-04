namespace Taharah.Web.Shared.Models;

public sealed class PillPeriodModel
{
    public string Type { get; set; } = "combined"; // combined, mini, orgast, other
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string Reason { get; set; } = "own"; // own, doctor, other
}
