using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Handlers.Auth;

public class LoginCommandHandler : IRequestHandler<LoginCommand, AuthResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly PasswordHasher<User> _passwordHasher = new();
    private readonly TokenGenerator _tokenGenerator;

    public LoginCommandHandler(ApplicationDbContext db, TokenGenerator tokenGenerator)
    {
        _db = db;
        _tokenGenerator = tokenGenerator;
    }

    public async Task<AuthResponse> Handle(LoginCommand command, CancellationToken ct)
    {
        // Identifier-agnostic: LoginCommand carries a single string typed as
        // Email, but the SPA sends the username in it. Accept either so both
        // the documented email flow and the shipped client keep working.
        // (Password check below is the real gate; identifiers only locate.)
        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Email == command.Email || u.Username == command.Email, ct);
        if (user == null)
            throw new UnauthorizedAccessException("Invalid credentials");

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, command.Password);
        if (result == PasswordVerificationResult.Failed)
            throw new UnauthorizedAccessException("Invalid credentials");

        return await _tokenGenerator.GenerateAuthResponseAsync(user);
    }
}
