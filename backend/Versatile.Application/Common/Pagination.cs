namespace Versatile.Application.Common;

public record PagedRequest(int Page = 1, int PageSize = 20)
{
    /// <summary>Upper bound for any list endpoint (DoS guard: unbounded pageSize reaches the query layer).</summary>
    public const int MaxPageSize = 100;

    public int Page { get; init; } = Math.Max(1, Page);
    public int PageSize { get; init; } = Math.Clamp(PageSize, 1, MaxPageSize);
}

public record PagedResponse<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize, Guid? NextCursor = null)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasPreviousPage => Page > 1;
    public bool HasNextPage => NextCursor.HasValue || Page < TotalPages;
}

public record KeysetPagedResponse<T>(IReadOnlyList<T> Items, Guid? NextCursor, int PageSize)
{
    public bool HasNextPage => NextCursor.HasValue;
}

public interface IPagedQuery<TResponse> : MediatR.IRequest<PagedResponse<TResponse>>
{
    int Page { get; }
    int PageSize { get; }
    Guid? AfterId { get; }
}
