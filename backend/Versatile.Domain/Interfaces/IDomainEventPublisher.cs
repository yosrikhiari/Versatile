using Versatile.Domain.Common;

namespace Versatile.Domain.Interfaces;

public interface IDomainEventPublisher
{
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IDomainEvent;
}
