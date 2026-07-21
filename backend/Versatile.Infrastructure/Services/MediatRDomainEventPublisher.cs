using MediatR;
using Versatile.Application.Common;
using Versatile.Domain.Common;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Services;

public class MediatRDomainEventPublisher : IDomainEventPublisher
{
    private readonly IPublisher _publisher;

    public MediatRDomainEventPublisher(IPublisher publisher)
    {
        _publisher = publisher;
    }

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IDomainEvent
    {
        var notification = new DomainEventNotification<TEvent>(@event);
        await _publisher.Publish(notification, ct);
    }
}
