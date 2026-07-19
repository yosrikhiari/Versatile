using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Auth.Queries;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Handlers.Auth;

public class GetUserInfoQueryHandler : IRequestHandler<GetUserInfoQuery, UserInfo>
{
    private readonly ApplicationDbContext _db;

    public GetUserInfoQueryHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<UserInfo> Handle(GetUserInfoQuery query, CancellationToken ct)
    {
        var user = await _db.Users
            .Where(u => u.Id == query.UserId)
            .Select(u => new UserInfo(u.Id, u.Username, u.Email, u.DisplayName))
            .FirstOrDefaultAsync(ct);

        return user ?? throw new KeyNotFoundException("User not found");
    }
}
