using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Handlers.Auth;

public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, AuthResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly TokenGenerator _tokenGenerator;

    public RefreshTokenCommandHandler(ApplicationDbContext db, TokenGenerator tokenGenerator)
    {
        _db = db;
        _tokenGenerator = tokenGenerator;
    }

    public async Task<AuthResponse> Handle(RefreshTokenCommand command, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.RefreshToken == command.RefreshToken, ct);
        if (user == null || user.RefreshTokenExpiresAt < DateTime.UtcNow)
            throw new UnauthorizedAccessException("Invalid or expired refresh token");

        return await _tokenGenerator.GenerateAuthResponseAsync(user);
    }
}
