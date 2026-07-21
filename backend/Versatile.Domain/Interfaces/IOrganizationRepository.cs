using Versatile.Domain.Entities;
using Versatile.Domain.Enums;

namespace Versatile.Domain.Interfaces;

public interface IOrganizationRepository
{
    Task<List<Organization>> GetUserOrganizationsAsync(Guid userId, CancellationToken ct = default);
    Task<OrganizationMembership?> GetMembershipAsync(Guid organizationId, Guid userId, CancellationToken ct = default);
    Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Organization> CreateAsync(string name, string slug, Guid userId, CancellationToken ct = default);
    Task UpdateAsync(Organization organization, CancellationToken ct = default);
    Task DeleteAsync(Organization organization, CancellationToken ct = default);
    Task<bool> IsMemberAsync(Guid organizationId, Guid userId, CancellationToken ct = default);
    Task AddMemberAsync(Guid organizationId, Guid userId, OrganizationRole role, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid organizationId, Guid userId, CancellationToken ct = default);
}
