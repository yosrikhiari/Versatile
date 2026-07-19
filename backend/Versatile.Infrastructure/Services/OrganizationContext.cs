using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Services;

public class OrganizationContext : IOrganizationContext
{
    public Guid? OrganizationId { get; private set; }
    public string? OrganizationRole { get; private set; }

    public void SetOrganization(Guid? organizationId, string? organizationRole)
    {
        OrganizationId = organizationId;
        OrganizationRole = organizationRole;
    }
}
