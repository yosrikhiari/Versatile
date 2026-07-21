using System.Text.Json;
using FluentAssertions;

namespace Versatile.Api.Tests.Contract;

public sealed class ApiResponseContractTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [Fact]
    public void ApiResponse_ShouldWrapDataInEnvelope()
    {
        var json = """{"data":{"id":"abc","name":"test"},"success":true,"error":null}""";
        var result = JsonSerializer.Deserialize<ApiResponse<TestData>>(json, Options);

        result.Should().NotBeNull();
        result!.Success.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Id.Should().Be("abc");
        result.Error.Should().BeNull();
    }

    [Fact]
    public void ApiResponse_ShouldHandleError()
    {
        var json = """{"data":null,"success":false,"error":{"code":"NOT_FOUND","message":"Resource not found"}}""";
        var result = JsonSerializer.Deserialize<ApiResponse<object>>(json, Options);

        result.Should().NotBeNull();
        result!.Success.Should().BeFalse();
        result.Data.Should().BeNull();
        result.Error.Should().NotBeNull();
        result.Error!.Code.Should().Be("NOT_FOUND");
    }

    [Fact]
    public void ApiResponse_ShouldHandleListData()
    {
        var json = """{"data":[],"success":true,"error":null}""";
        var result = JsonSerializer.Deserialize<ApiResponse<List<TestData>>>(json, Options);

        result.Should().NotBeNull();
        result!.Success.Should().BeTrue();
        result.Data.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void PagedResponse_ShouldIncludePaginationMetadata()
    {
        var json = """{"data":[{"id":"1"}],"page":1,"pageSize":20,"totalCount":1,"totalPages":1,"hasNextPage":false,"hasPreviousPage":false}""";
        var result = JsonSerializer.Deserialize<PagedResponse<TestData>>(json, Options);

        result.Should().NotBeNull();
        result!.Page.Should().Be(1);
        result.PageSize.Should().Be(20);
        result.TotalCount.Should().Be(1);
        result.HasNextPage.Should().BeFalse();
    }

    private sealed class TestData
    {
        public string Id { get; set; } = string.Empty;
        public string? Name { get; set; }
    }

    // Lightweight response shapes matching the backend contracts
    private sealed class ApiResponse<T>
    {
        public T? Data { get; set; }
        public bool Success { get; set; }
        public ApiError? Error { get; set; }
    }

    private sealed class ApiError
    {
        public string Code { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }

    private sealed class PagedResponse<T>
    {
        public List<T> Data { get; set; } = [];
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }
        public bool HasNextPage { get; set; }
        public bool HasPreviousPage { get; set; }
    }
}
