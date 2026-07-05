namespace Versatile.Application.DTOs;

public record RegisterRequest(string Username, string Email, string Password, string? DisplayName);
public record LoginRequest(string Username, string Password);
public record RefreshRequest(string RefreshToken);
public record AuthResponse(string Token, string RefreshToken, DateTime ExpiresAt, UserInfo User);
public record UserInfo(Guid Id, string Username, string? Email, string? DisplayName);
