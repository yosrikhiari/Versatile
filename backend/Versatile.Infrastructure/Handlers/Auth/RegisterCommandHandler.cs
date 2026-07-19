using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Handlers.Auth;

public class RegisterCommandHandler : IRequestHandler<RegisterCommand, AuthResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly PasswordHasher<User> _passwordHasher = new();
    private readonly TokenGenerator _tokenGenerator;

    public RegisterCommandHandler(ApplicationDbContext db, TokenGenerator tokenGenerator)
    {
        _db = db;
        _tokenGenerator = tokenGenerator;
    }

    public async Task<AuthResponse> Handle(RegisterCommand command, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Username == command.Username, ct))
            throw new InvalidOperationException("Username already taken");

        if (!string.IsNullOrEmpty(command.Email) && await _db.Users.AnyAsync(u => u.Email == command.Email, ct))
            throw new InvalidOperationException("Email already registered");

        var user = new User
        {
            Username = command.Username,
            Email = command.Email,
            DisplayName = command.DisplayName ?? command.Username
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, command.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return await _tokenGenerator.GenerateAuthResponseAsync(user);
    }
}
