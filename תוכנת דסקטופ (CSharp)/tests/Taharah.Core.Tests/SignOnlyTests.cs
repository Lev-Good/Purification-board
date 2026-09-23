using Taharah.Core.Algorithms;
using Taharah.Core.Enums;
using Taharah.Core.Calendar;
using Taharah.Core.Models;

namespace Taharah.Core.Tests;

public class SignOnlyTests
{
    [Fact]
    public void StandaloneSigns_TrackedAndEstablishVesetGuf()
    {
        var list = new List<ReiyahEvent>
        {
            new() { Abs = 10000, Ona = OnaType.Day, HDate = new HDate(10000), Signs = ["yawn"] },
            new() { Abs = 10030, Ona = OnaType.Day, HDate = new HDate(10030), Signs = ["yawn"] },
            new() { Abs = 10060, Ona = OnaType.Day, HDate = new HDate(10060), Signs = ["yawn"] }
        };

        var verdict = VesetGufManager.AnalyzeBodyVeset(list);

        Assert.True(verdict.Configured);
        Assert.Single(verdict.FixedBody);
        Assert.Equal("yawn", verdict.FixedBody[0].Code);
        Assert.Equal(3, verdict.FixedBody[0].Count);
    }

    [Fact]
    public void TwoSigns_ShortOfChazaka()
    {
        var list = new List<ReiyahEvent>
        {
            new() { Abs = 10000, Ona = OnaType.Day, HDate = new HDate(10000), Signs = ["yawn"] },
            new() { Abs = 10030, Ona = OnaType.Day, HDate = new HDate(10030), Signs = ["yawn"] }
        };

        var verdict = VesetGufManager.AnalyzeBodyVeset(list);

        Assert.True(verdict.Configured);
        Assert.Empty(verdict.FixedBody);
        Assert.Single(verdict.PendingBody);
        Assert.False(verdict.PendingBody[0].Fixed);
    }
}
