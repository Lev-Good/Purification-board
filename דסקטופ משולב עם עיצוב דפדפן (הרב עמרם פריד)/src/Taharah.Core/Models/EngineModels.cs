using Taharah.Core.Calendar;
using Taharah.Core.Enums;

namespace Taharah.Core.Models;

public sealed class ReiyahEvent
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public HDate HDate { get; set; } = null!;
    public string Kind { get; set; } = "regular";
    public int? DurationDays { get; set; }
    public bool? ClosedFountain { get; set; }
    public List<string> Signs { get; set; } = [];
    public bool SafekOna { get; set; }
    public int? HaflagahDiff { get; set; }
    public HDate? NextHaflagahDate { get; set; }

    public bool Counted { get; set; }
    public bool Establishing { get; set; }
}

public sealed class PrishahEntry
{
    public int Abs { get; set; }
    public OnaType Ona { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public bool EstablishedConcern { get; set; }

    public bool Uprooted { get; set; }
}

public sealed class SuppressedEntry
{
    public string Code { get; set; } = string.Empty;
    public string Why { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public Taharah.Core.Algorithms.EstablishedVeset? Veset { get; set; }
}

public sealed class CheckExemptionInfo
{
    public bool Exempt { get; set; }
    public string? Reason { get; set; }
}

/// <summary>One day marked "sudden fright" (dayMarks 'fright'), and whether it was resolved by a sighting or a proper (non-wipe) check that day.</summary>
public sealed class FrightDayInfo
{
    public int Abs { get; set; }
    public bool Sighting { get; set; }
    public bool ProperCheck { get; set; }
    public bool WipeOnly { get; set; }
    public bool Resolved { get; set; }
    public bool DemandsBedikah { get; set; }
    public bool DayExemptFromCheck { get; set; }
}

/// <summary>
/// "פחד פתאום" (sudden fright) and "חרדה מתמשכת" (ongoing anxiety) tracking - always
/// computed (unlike the pending-check DEMAND itself, which is gated by the frightBedika
/// stringency), so a day-state panel can show what's still unresolved regardless of the
/// toggle. Ported from js/calculations.js's `fright` object.
/// </summary>
public sealed class FrightVerdict
{
    public List<int> Days { get; set; } = [];
    public List<FrightDayInfo> Open { get; set; } = [];
    public List<FrightDayInfo> Settled { get; set; } = [];
    public bool DemandsBedikah { get; set; }
    public List<int> AnxietyDays { get; set; } = [];
}

public sealed class EngineOptions
{
    public bool IsOrZaruaEnabled { get; set; }
    public bool Chazaka { get; set; } = true;
    public bool Akirot { get; set; } = true;
    public int? Today { get; set; }
    public Taharah.Core.Algorithms.LifeStateModel? Life { get; set; }
    public Dictionary<string, bool> Stringencies { get; set; } = [];
}

public sealed class EngineResult
{
    public List<int> Nekiim { get; set; } = [];
    public List<int> Tevilot { get; set; } = [];
    public Dictionary<int, List<PrishahEntry>> Prishot { get; set; } = [];
    public List<ReiyahEvent> Reiyot { get; set; } = [];
    public Taharah.Core.Algorithms.LifeStateVerdict? Life { get; set; }
    public Taharah.Core.Algorithms.SilekReturnResult? SilekReturn { get; set; }
    public List<Taharah.Core.Algorithms.EstablishedVeset> StandingVesets { get; set; } = [];
    public List<SuppressedEntry> Suppressed { get; set; } = [];

    public List<PrishahEntry> Uprooted { get; set; } = [];

    public List<Taharah.Core.Algorithms.PendingCheckEntry> PendingChecks { get; set; } = [];

    public Taharah.Core.Algorithms.AkirotResult? Akirot { get; set; }

    public CheckExemptionInfo? CheckExemption { get; set; }

    public Taharah.Core.Algorithms.BodyVesetVerdict? BodyVeset { get; set; }

    public List<Taharah.Core.Algorithms.StandaloneSignEntry> StandaloneSigns { get; set; } = [];

    public Taharah.Core.Algorithms.PillPauseVerdict? PillPause { get; set; }

    public List<Taharah.Core.Algorithms.DilugCandidate> DilugCandidates { get; set; } = [];

    public List<Taharah.Core.Algorithms.OrZaruaExemption> OrZaruaExemptions { get; set; } = [];

    public FrightVerdict Fright { get; set; } = new();
}


