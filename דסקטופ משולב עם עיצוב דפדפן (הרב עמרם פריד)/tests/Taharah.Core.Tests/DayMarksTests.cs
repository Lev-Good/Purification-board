using Taharah.Core.Algorithms;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class DayMarksTests
{
    [Fact]
    public void DayMarks_DefinitionsCount()
    {
        Assert.Equal(5, DayMarksManager.DayMarks.Count);
        string[] expected = ["stain", "fright", "anxiety", "travel", "chuppah"];
        foreach (var code in expected)
        {
            Assert.Contains(DayMarksManager.DayMarks, m => m.Code == code);
        }
    }

    [Fact]
    public void MarksOf_FiltersUnknownAndDuplicates()
    {
        var cleaned = DayMarksManager.MarksOf(["stain", "nonsense", "stain"]);
        Assert.Single(cleaned);
        Assert.Equal("stain", cleaned[0]);
    }

    [Fact]
    public void OrZaruaExemption_Chuppah()
    {
        var marks = new Dictionary<int, List<string>>
        {
            [100] = ["chuppah"]
        };

        var exemption = DayMarksManager.OrZaruaExemptionFor(100, OnaType.Night, marks, null);
        Assert.NotNull(exemption);
        Assert.Equal("chuppah", exemption.Code);
    }

    [Fact]
    public void OrZaruaExemption_Travel()
    {
        var marks = new Dictionary<int, List<string>>
        {
            [100] = ["travel"]
        };

        var exemption = DayMarksManager.OrZaruaExemptionFor(100, OnaType.Day, marks, null);
        Assert.NotNull(exemption);
        Assert.Equal("travel", exemption.Code);
    }
}
