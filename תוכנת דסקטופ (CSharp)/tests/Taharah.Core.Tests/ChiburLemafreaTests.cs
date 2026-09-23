using Taharah.Core.Algorithms;
using Taharah.Core.Calendar;
using Taharah.Core.Enums;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class ChiburLemafreaTests
{
    private static List<ReiyahEvent> SightingSpans(int[] spans, int startAbs = 10000)
    {
        var outList = new List<ReiyahEvent>();
        int abs = startAbs;
        foreach (var span in spans)
        {
            outList.Add(new ReiyahEvent { Abs = abs, Ona = OnaType.Day, HDate = new HDate(abs) });
            abs += span;
        }
        outList.Add(new ReiyahEvent { Abs = abs, Ona = OnaType.Day, HDate = new HDate(abs) });
        return outList;
    }

    [Fact]
    public void DetectChibur_ThreeEqualSpansWithOneShorter()
    {
        // שלוש הפלגות של ל' שהפסיק ביניהן כ' — מזוהה כמועמד וסת של ל'
        int span = 30;
        var pattern = SightingSpans([span, span, 20, span]);

        var candidate = ChazakaManager.DetectChiburLemafrea(pattern);

        Assert.NotNull(candidate);
        Assert.Equal("haflagah", candidate.Kind);
        Assert.Equal(30, candidate.Span);
        Assert.True(candidate.ViaChibur);
        Assert.Equal(5, candidate.EstablishedBy.Count);
        Assert.Equal("20", string.Join(",", candidate.GapSpans));
    }

    [Fact]
    public void DetectChibur_LongerSpanBreaksDetection()
    {
        // הפלגה ארוכה מן הארוכה מפסיקה את הזיהוי
        int span = 30;
        var pattern = SightingSpans([span, span, 35, span]);

        var candidate = ChazakaManager.DetectChiburLemafrea(pattern);
        Assert.Null(candidate);
    }
}
