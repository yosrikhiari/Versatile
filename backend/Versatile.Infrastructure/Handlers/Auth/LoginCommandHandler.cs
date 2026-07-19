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
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == command.Email, ct);
        if (user == null)
            throw new UnauthorizedAccessException("Invalid credentials");

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, command.Password);
        if (result == PasswordVerificationResult.Failed)
            throw new UnauthorizedAccessException("Invalid credentials");

        return await _tokenGenerator.GenerateAuthResponseAsync(user);
    }
}
