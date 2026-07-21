using Versatile.Domain.Common;

namespace Versatile.Domain.Events;

public sealed class StoryCreatedEvent : DomainEventBase
{
    public Guid StoryId { get; }
    public string Title { get; }
    public Guid UserId { get; }

    public StoryCreatedEvent(Guid storyId, string title, Guid userId)
    {
        StoryId = storyId;
        Title = title;
        UserId = userId;
    }
}
