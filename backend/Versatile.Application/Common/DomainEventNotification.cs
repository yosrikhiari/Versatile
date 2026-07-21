using MediatR;
using Versatile.Domain.Common;

namespace Versatile.Application.Common;

public record DomainEventNotification<TEvent>(TEvent Event) : INotification where TEvent : IDomainEvent;
