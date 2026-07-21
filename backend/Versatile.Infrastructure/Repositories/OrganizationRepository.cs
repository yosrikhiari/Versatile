using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Repositories;

public class OrganizationRepository : IOrganizationRepository
{
    private readonly ApplicationDbContext _db;

    public OrganizationRepository(ApplicationDbContext db) => _db = db;

    public async Task<List<Organization>> GetUserOrganizationsAsync(Guid userId, CancellationToken ct = default) =>
        await _db.OrganizationMemberships
            .Where(m => m.UserId == userId)
            .Include(m => m.Organization)
            .Select(m => m.Organization)
            .ToListAsync(ct);

    public async Task<OrganizationMembership?> GetMembershipAsync(Guid organizationId, Guid userId, CancellationToken ct = default) =>
        await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == organizationId && m.UserId == userId, ct);

    public async Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _db.Organizations.FindAsync([id], ct);

    public async Task<Organization> CreateAsync(string name, string slug, Guid userId, CancellationToken ct = default)
    {
        var org = new Organization { Name = name, Slug = slug };
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync(ct);

        _db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = org.Id,
            UserId = userId,
            Role = OrganizationRole.Admin
        });
        await _db.SaveChangesAsync(ct);

        return org;
    }

    public async Task UpdateAsync(Organization organization, CancellationToken ct = default)
    {
        _db.Organizations.Update(organization);
        await _db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Organization organization, CancellationToken ct = default)
    {
        _db.Organizations.Remove(organization);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> IsMemberAsync(Guid organizationId, Guid userId, CancellationToken ct = default) =>
        await _db.OrganizationMemberships.AnyAsync(m => m.OrganizationId == organizationId && m.UserId == userId, ct);

    public async Task AddMemberAsync(Guid organizationId, Guid userId, OrganizationRole role, CancellationToken ct = default)
    {
        _db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = organizationId,
            UserId = userId,
            Role = role
        });
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveMemberAsync(Guid organizationId, Guid userId, CancellationToken ct = default)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == organizationId && m.UserId == userId, ct);
        if (membership != null)
        {
            _db.OrganizationMemberships.Remove(membership);
            await _db.SaveChangesAsync(ct);
        }
    }
}
