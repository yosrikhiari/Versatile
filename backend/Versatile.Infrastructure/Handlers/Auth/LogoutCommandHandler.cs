using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Commands;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Handlers.Auth;

public class LogoutCommandHandler : IRequestHandler<LogoutCommand>
{
    private readonly ApplicationDbContext _db;

    public LogoutCommandHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task Handle(LogoutCommand command, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync([command.UserId], ct);
        if (user == null) return;

        user.RefreshToken = null;
        user.RefreshTokenExpiresAt = null;
        await _db.SaveChangesAsync(ct);
    }
}
