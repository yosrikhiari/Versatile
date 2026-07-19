namespace Versatile.Api.Common;

public sealed record ApiResponse<T>(T Data, string? Message = null)
{
    public static ApiResponse<T> Success(T data) => new(data);
    public static ApiResponse<T> Success(T data, string message) => new(data, message);
}

public sealed record ApiErrorResponse(string Error, string? Detail = null);