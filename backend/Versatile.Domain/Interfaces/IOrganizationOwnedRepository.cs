namespace Versatile.Domain.Interfaces;

public interface IOrganizationOwnedRepository<T> : IUserOwnedRepository<T> where T : class
{
    Task<List<T>> GetAllForOrganizationAsync(Guid organizationId, CancellationToken ct = default);
    Task<T?> GetByIdForOrganizationAsync(Guid id, Guid organizationId, CancellationToken ct = default);
}
