namespace Versatile.Domain.Interfaces;

public interface IOrganizationContext
{
    Guid? OrganizationId { get; }
    string? OrganizationRole { get; }
}
