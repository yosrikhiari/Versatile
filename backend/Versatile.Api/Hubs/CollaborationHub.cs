using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Versatile.Application.Services;

namespace Versatile.Api.Hubs;

[Authorize]
public class CollaborationHub : Hub
{
    private readonly IStoryAccessChecker _access;

    public CollaborationHub(IStoryAccessChecker access)
    {
        _access = access;
    }

    private string OrgGroupPrefix => $"{Context.User!.FindFirstValue("org_id")}_";

    private Guid UserId => Guid.Parse(Context.User!.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    private Guid? OrganizationId =>
        Guid.TryParse(Context.User!.FindFirstValue("org_id"), out var orgId) ? orgId : null;

    /// <summary>
    /// Group membership is the only gate for the per-keystroke handlers
    /// below (checking the database on every CursorMoved would cost more than
    /// the broadcast), so joining verifies story entitlement and fails closed.
    /// </summary>
    public async Task JoinStoryGroup(string storyId)
    {
        if (!Guid.TryParse(storyId, out var id) ||
            !await _access.CanAccessAsync(id, UserId, OrganizationId))
            throw new HubException("Story not found.");

        await Groups.AddToGroupAsync(Context.ConnectionId, $"{OrgGroupPrefix}collab_{storyId}");
    }

    public async Task LeaveStoryGroup(string storyId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"{OrgGroupPrefix}collab_{storyId}");
    }

    public async Task CursorMoved(string storyId, string userId, string position)
    {
        await Clients.OthersInGroup($"{OrgGroupPrefix}collab_{storyId}").SendAsync("CursorMoved", userId, position);
    }

    public async Task ContentChanged(string storyId, string sceneId, string content)
    {
        await Clients.OthersInGroup($"{OrgGroupPrefix}collab_{storyId}").SendAsync("ContentChanged", sceneId, content, Context.UserIdentifier);
    }
}
