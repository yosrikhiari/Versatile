using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
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

        // Every story endpoint requires an active organization (the token's
        // org_id claim); a user registered without one got 403 on everything,
        // so a fresh account could never sync. Give each new user a personal
        // workspace they administer; the token below then carries its org_id.
        var org = new Organization
        {
            Name = $"{user.DisplayName}'s workspace",
            Slug = $"personal-{user.Id:N}"
        };
        _db.Organizations.Add(org);
        _db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = org.Id,
            UserId = user.Id,
            Role = OrganizationRole.Admin
        });
        await _db.SaveChangesAsync(ct);

        return await _tokenGenerator.GenerateAuthResponseAsync(user);
    }
}
