using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshTokenAsync(string refreshToken);
    Task<AuthResponse> SwitchOrgAsync(Guid userId, Guid orgId);
    Task LogoutAsync(Guid userId);
}
