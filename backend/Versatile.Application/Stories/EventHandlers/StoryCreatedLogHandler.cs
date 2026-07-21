using MediatR;
using Microsoft.Extensions.Logging;
using Versatile.Application.Common;
using Versatile.Domain.Events;

namespace Versatile.Application.Stories.EventHandlers;

public class StoryCreatedLogHandler : INotificationHandler<DomainEventNotification<StoryCreatedEvent>>
{
    private readonly ILogger<StoryCreatedLogHandler> _logger;

    public StoryCreatedLogHandler(ILogger<StoryCreatedLogHandler> logger)
    {
        _logger = logger;
    }

    public Task Handle(DomainEventNotification<StoryCreatedEvent> notification, CancellationToken ct)
    {
        var e = notification.Event;
        _logger.LogInformation("Story created: {StoryId} - \"{Title}\" by user {UserId}", e.StoryId, e.Title, e.UserId);
        return Task.CompletedTask;
    }
}
