using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Repositories;

public class UserOwnedRepository<T> : Repository<T>, IUserOwnedRepository<T>
    where T : UserOwnedEntity
{
    public UserOwnedRepository(DbContext dbContext) : base(dbContext) { }

    public async Task<List<T>> GetAllForUserAsync(Guid userId, CancellationToken ct = default) =>
        await DbSet.Where(e => e.UserId == userId).OrderByDescending(e => e.UpdatedAt).ToListAsync(ct);

    public async Task<T?> GetByIdForUserAsync(Guid id, Guid userId, CancellationToken ct = default) =>
        await DbSet.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId, ct);

    public async Task<bool> ExistsForUserAsync(Guid id, Guid userId, CancellationToken ct = default) =>
        await DbSet.AnyAsync(e => e.Id == id && e.UserId == userId, ct);
}
