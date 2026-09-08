using FluentAssertions;
using Versatile.Application.Common;

namespace Versatile.Api.Tests.Infrastructure;

/// <summary>
/// PagedRequest is the single HTTP entry point for paging: unbounded pageSize
/// must never reach the query layer (DoS guard).
/// </summary>
public class PagedRequestTests
{
    [Fact]
    public void Defaults_ArePage1_Size20()
    {
        var req = new PagedRequest();

        req.Page.Should().Be(1);
        req.PageSize.Should().Be(20);
    }

    [Theory]
    [InlineData(1000, 100)]
    [InlineData(101, 100)]
    [InlineData(100, 100)]
    [InlineData(20, 20)]
    public void PageSize_IsClampedToMax100(int input, int expected)
    {
        new PagedRequest(1, input).PageSize.Should().Be(expected);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    public void PageSize_BelowOne_IsClampedToOne(int input, int expected)
    {
        new PagedRequest(1, input).PageSize.Should().Be(expected);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-3, 1)]
    [InlineData(2, 2)]
    public void Page_BelowOne_IsClampedToOne(int input, int expected)
    {
        new PagedRequest(input, 20).Page.Should().Be(expected);
    }
}
