using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Algorithms;

public sealed class ChiburCandidate
{
    public string Kind { get; set; } = "haflagah";
    public OnaType Ona { get; set; }
    public int Span { get; set; }
    public int SpanLabel { get; set; }
    public bool ViaChibur { get; set; } = true;
    public List<int> EstablishedBy { get; set; } = [];
    public List<int> GapSpans { get; set; } = [];
}
