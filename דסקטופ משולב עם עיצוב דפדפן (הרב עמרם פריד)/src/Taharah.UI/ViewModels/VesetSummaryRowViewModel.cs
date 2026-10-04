namespace Taharah.UI.ViewModels;

/// <summary>One row of the veset-summary table (js/ui.js's renderSummaryTable) - pre-formatted text, since the table only ever displays it, never edits it.</summary>
public sealed class VesetSummaryRowViewModel
{
    public string DateText { get; set; } = string.Empty;
    public string OnaText { get; set; } = string.Empty;
    public string HaflagahText { get; set; } = "-";
    public string BeinonitDay30Text { get; set; } = string.Empty;
    public string BeinonitDay31Text { get; set; } = string.Empty;
    public string YomHachodeshText { get; set; } = string.Empty;
    public bool YomHachodeshDisputed { get; set; }
    public string NextHaflagahText { get; set; } = "-";
    public bool IsEstablishing { get; set; }
    public string? SignNote { get; set; }
}
