using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Repositories;

public class OrganizationOwnedRepository<T> : UserOwnedRepository<T>, IOrganizationOwnedRepository<T>
    where T : UserOwnedEntity
{
    public OrganizationOwnedRepository(DbContext dbContext) : base(dbContext) { }

    public async Task<List<T>> GetAllForOrganizationAsync(Guid organizationId, CancellationToken ct = default) =>
        await DbSet.Where(e => e.OrganizationId == organizationId).OrderByDescending(e => e.UpdatedAt).ToListAsync(ct);

    public async Task<T?> GetByIdForOrganizationAsync(Guid id, Guid organizationId, CancellationToken ct = default) =>
        await DbSet.FirstOrDefaultAsync(e => e.Id == id && e.OrganizationId == organizationId, ct);
}
