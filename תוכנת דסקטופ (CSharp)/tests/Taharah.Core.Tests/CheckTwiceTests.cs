using Taharah.Core.Algorithms;
using Taharah.Core.Enums;

namespace Taharah.Core.Tests;

public class CheckTwiceTests
{
    [Fact]
    public void CheckPartsOf_PreservesOrderAndDeduplicates()
    {
        var parts = AkiraManager.CheckPartsOf(["rise", "sunset"]);
        Assert.Equal("rise+sunset", string.Join("+", parts));

        int count = AkiraManager.CheckCountOf(isCheck: true, twice: true, parts: ["rise", "sunset"]);
        Assert.Equal(2, count);

        int singleCount = AkiraManager.CheckCountOf(isCheck: true, twice: false, parts: null);
        Assert.Equal(1, singleCount);

        int reiyahCount = AkiraManager.CheckCountOf(isCheck: false, twice: false, parts: null);
        Assert.Equal(0, reiyahCount);
    }

    [Fact]
    public void ExtractChecks_ProducesRecordPerPart()
    {
        var db = new Dictionary<int, (string Type, OnaType Ona, string Depth, bool Twice, List<string>? Parts)>
        {
            [100] = ("check", OnaType.Day, "deep", true, ["rise", "sunset"])
        };

        var records = AkiraManager.ExtractChecks(db);
        Assert.Equal(2, records.Count);
        Assert.Equal("rise", records[0].Part);
        Assert.Equal("sunset", records[1].Part);
    }
}
