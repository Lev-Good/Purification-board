using CommunityToolkit.Mvvm.ComponentModel;

namespace Taharah.UI.ViewModels;

public partial class EventEntryViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsReiyah))]
    [NotifyPropertyChangedFor(nameof(IsHefsek))]
    [NotifyPropertyChangedFor(nameof(IsCheck))]
    [NotifyPropertyChangedFor(nameof(IsTevilah))]
    [NotifyPropertyChangedFor(nameof(IsMark))]
    [NotifyPropertyChangedFor(nameof(IsSign))]
    private string _entryType = "ראייה"; // "ראייה", "הפסק טהרה", "בדיקה", "טבילה", "כתם/סימון", "מיחוש"

    public bool IsReiyah => EntryType == "ראייה";
    public bool IsHefsek => EntryType == "הפסק טהרה";
    public bool IsCheck => EntryType == "בדיקה";
    public bool IsTevilah => EntryType == "טבילה";
    public bool IsMark => EntryType == "כתם/סימון";
    public bool IsSign => EntryType == "מיחוש";

    [ObservableProperty]
    private string _ona = "יום"; // "יום", "לילה"

    [ObservableProperty]
    private bool _isDayOna = true;

    partial void OnIsDayOnaChanged(bool value)
    {
        if (value)
        {
            if (_isNightOna)
            {
                _isNightOna = false;
                OnPropertyChanged(nameof(IsNightOna));
            }
            Ona = "יום";
        }
        else if (!_isNightOna)
        {
            _isNightOna = true;
            OnPropertyChanged(nameof(IsNightOna));
            Ona = "לילה";
        }
    }

    [ObservableProperty]
    private bool _isNightOna;

    partial void OnIsNightOnaChanged(bool value)
    {
        if (value)
        {
            if (_isDayOna)
            {
                _isDayOna = false;
                OnPropertyChanged(nameof(IsDayOna));
            }
            Ona = "לילה";
        }
        else if (!_isDayOna)
        {
            _isDayOna = true;
            OnPropertyChanged(nameof(IsDayOna));
            Ona = "יום";
        }
    }

    // "regular" | "ones" | "sharp" | "pills" | "kefitza" - Taharah.Core.Algorithms.ReiyahEvent.Kind's own
    // codes. A mutually-exclusive radio group in the UI (js/app.js's reiyah-kind).
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsKindRegular))]
    [NotifyPropertyChangedFor(nameof(IsKindOnes))]
    [NotifyPropertyChangedFor(nameof(IsKindSharp))]
    [NotifyPropertyChangedFor(nameof(IsKindPills))]
    [NotifyPropertyChangedFor(nameof(IsKindKefitza))]
    private string _reiyahKind = "regular";

    public bool IsKindRegular
    {
        get => ReiyahKind == "regular";
        set { if (value) ReiyahKind = "regular"; }
    }
    public bool IsKindOnes
    {
        get => ReiyahKind == "ones";
        set { if (value) ReiyahKind = "ones"; }
    }
    public bool IsKindSharp
    {
        get => ReiyahKind == "sharp";
        set { if (value) ReiyahKind = "sharp"; }
    }
    public bool IsKindPills
    {
        get => ReiyahKind == "pills";
        set { if (value) ReiyahKind = "pills"; }
    }
    /// <summary>ראייה שבאה בעקבות קפיצה גופנית - וסת הקפיצות (VesetKefitzotManager), הלכות טהרה הר"ע פריד פרק כז חלק ב.</summary>
    public bool IsKindKefitza
    {
        get => ReiyahKind == "kefitza";
        set { if (value) ReiyahKind = "kefitza"; }
    }

    [ObservableProperty]
    private bool _isSafekOna; // ספק עונה - איני בטוחה אם הראייה היתה בעונה זו או בקודמתה

    [ObservableProperty]
    private bool _hasMultiDayBleeding; // כמה ימים סך הכל נמשך הדימום

    [ObservableProperty]
    private int _durationDays = 2;

    [ObservableProperty]
    private bool _continuesPrevious; // המשך ראייה קודמת

    [ObservableProperty]
    private bool _signYawn; // פיהוק

    [ObservableProperty]
    private bool _signSneeze; // עיטוש

    [ObservableProperty]
    private bool _signCramps; // כאבים בפי כריסה ובשפולי מעיה

    [ObservableProperty]
    private bool _signHeaviness; // כובד ראש ואיברים

    [ObservableProperty]
    private bool _signChills; // צמרמורות

    [ObservableProperty]
    private bool _signBlood; // שופעת דם טמא מתוך דם טהור

    [ObservableProperty]
    private bool _signNausea; // בחילה או הקאה

    [ObservableProperty]
    private bool _signWeakness; // חולשה

    [ObservableProperty]
    private bool _signFaceSpots; // פצעים בפנים

    [ObservableProperty]
    private bool _signSharpFood; // אכילת דברים חריפים

    [ObservableProperty]
    private bool _signOther; // מיחוש אחר, משונה וקשור לראייה

    /// <summary>"certain" | "likely" | "vague" - VesetGufManager.NormalizeSignCertainty's own codes.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsCertaintyValueCertain))]
    [NotifyPropertyChangedFor(nameof(IsCertaintyValueLikely))]
    [NotifyPropertyChangedFor(nameof(IsCertaintyValueVague))]
    private string _signCertainty = "certain";

    public bool IsCertaintyValueCertain
    {
        get => SignCertainty == "certain";
        set { if (value) SignCertainty = "certain"; }
    }
    public bool IsCertaintyValueLikely
    {
        get => SignCertainty == "likely";
        set { if (value) SignCertainty = "likely"; }
    }
    public bool IsCertaintyValueVague
    {
        get => SignCertainty == "vague";
        set { if (value) SignCertainty = "vague"; }
    }

    [ObservableProperty]
    private bool _isMochDachuk = true; // מוך דחוק בהפסק טהרה

    // "deep" | "wipe" - Taharah.Core.Algorithms.CheckDepthLabels' own codes (a check is
    // treated as "deep" unless it is EXACTLY "wipe" - see AkiraManager.ExtractChecks).
    [ObservableProperty]
    private string _checkDepth = "deep";

    // Day marks (Taharah.Core.Algorithms.DayMarksManager.DayMarks codes) - a day can carry
    // several of these at once (e.g. a stain AND sudden fright the same day), so each is its
    // own checkbox rather than one exclusive selection.
    [ObservableProperty]
    private bool _markStain;

    [ObservableProperty]
    private bool _markFright;

    [ObservableProperty]
    private bool _markAnxiety;

    [ObservableProperty]
    private bool _markTravel;

    [ObservableProperty]
    private bool _markChuppah;

    [ObservableProperty]
    private string _notes = string.Empty;

    /// <summary>The Taharah.Core.Algorithms.VesetGufManager.BodySigns codes currently checked, in the same fixed order as the sign list itself.</summary>
    public List<string> SelectedSigns()
    {
        var signs = new List<string>();
        if (SignYawn) signs.Add("yawn");
        if (SignSneeze) signs.Add("sneeze");
        if (SignCramps) signs.Add("cramps");
        if (SignHeaviness) signs.Add("heaviness");
        if (SignChills) signs.Add("chills");
        if (SignBlood) signs.Add("blood");
        if (SignNausea) signs.Add("nausea");
        if (SignWeakness) signs.Add("weakness");
        if (SignFaceSpots) signs.Add("faceSpots");
        if (SignSharpFood) signs.Add("sharpFood");
        if (SignOther) signs.Add("other");
        return signs;
    }

    public void Reset(string defaultType = "ראייה")
    {
        EntryType = defaultType;
        bool isNight = defaultType == "טבילה";
        if (isNight)
        {
            IsNightOna = true;
        }
        else
        {
            IsDayOna = true;
        }
        ReiyahKind = "regular";
        IsSafekOna = false;
        HasMultiDayBleeding = false;
        DurationDays = 2;
        ContinuesPrevious = false;
        SignYawn = false;
        SignSneeze = false;
        SignCramps = false;
        SignHeaviness = false;
        SignChills = false;
        SignBlood = false;
        SignNausea = false;
        SignWeakness = false;
        SignFaceSpots = false;
        SignSharpFood = false;
        SignOther = false;
        SignCertainty = "certain";
        IsMochDachuk = true;
        CheckDepth = "deep";
        MarkStain = false;
        MarkFright = false;
        MarkAnxiety = false;
        MarkTravel = false;
        MarkChuppah = false;
        Notes = string.Empty;
    }
}






