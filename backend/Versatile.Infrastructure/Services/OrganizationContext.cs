using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Services;

public class OrganizationContext : IOrganizationContext
{
    public Guid? OrganizationId { get; set; }
    public string? OrganizationRole { get; set; }
}
