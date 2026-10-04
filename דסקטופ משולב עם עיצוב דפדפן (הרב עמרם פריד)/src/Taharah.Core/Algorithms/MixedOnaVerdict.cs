using Taharah.Core.Enums;

namespace Taharah.Core.Algorithms;

public sealed class MixedOnaVerdict
{
    public string Kind { get; set; } = string.Empty;
    public int? DayOfMonth { get; set; }
    public int? Span { get; set; }
    public int? SpanLabel { get; set; }
    public OnaType FirstOna { get; set; }
    public OnaType LastOna { get; set; }
    public int LastAbs { get; set; }
    public List<int> EstablishedBy { get; set; } = [];
}
