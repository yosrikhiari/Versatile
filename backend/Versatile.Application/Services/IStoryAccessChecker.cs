namespace Versatile.Application.Services;

/// <summary>
/// Story entitlement for SignalR hubs, mirroring the persistence layer's rule
/// (<c>GeneratedStoryService.EnsureStoryAccess</c>): the story must exist, be
/// owned by the caller, and — when both sides name an organization — belong
/// to it. Hubs cannot reuse the MediatR queries (a join is not a query for a
/// DTO), so the rule lives here, once, and is unit-tested.
/// </summary>
public interface IStoryAccessChecker
{
    Task<bool> CanAccessAsync(Guid storyId, Guid userId, Guid? organizationId, CancellationToken cancellationToken = default);
}
