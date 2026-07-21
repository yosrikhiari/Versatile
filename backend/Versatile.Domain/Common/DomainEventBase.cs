namespace Versatile.Domain.Common;

public abstract class DomainEventBase : IDomainEvent
{
    public Guid Id { get; } = Guid.CreateVersion7();
    public DateTime OccurredAt { get; } = DateTime.UtcNow;
}
