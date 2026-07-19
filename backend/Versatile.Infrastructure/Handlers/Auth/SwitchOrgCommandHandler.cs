using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Handlers.Auth;

public class SwitchOrgCommandHandler : IRequestHandler<SwitchOrgCommand, AuthResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly TokenGenerator _tokenGenerator;

    public SwitchOrgCommandHandler(ApplicationDbContext db, TokenGenerator tokenGenerator)
    {
        _db = db;
        _tokenGenerator = tokenGenerator;
    }

    public async Task<AuthResponse> Handle(SwitchOrgCommand command, CancellationToken ct)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.UserId == command.UserId && m.OrganizationId == command.OrganizationId, ct);

        if (membership == null)
            throw new UnauthorizedAccessException("You are not a member of this organization");

        var user = await _db.Users.FindAsync([command.UserId], ct)
            ?? throw new UnauthorizedAccessException("User not found");

        return await _tokenGenerator.GenerateAuthResponseAsync(user, command.OrganizationId);
    }
}
