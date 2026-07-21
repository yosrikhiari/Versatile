using Versatile.Domain.Common;

namespace Versatile.Domain.Interfaces;

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
    void AddDomainEvent(IDomainEvent domainEvent);
}
