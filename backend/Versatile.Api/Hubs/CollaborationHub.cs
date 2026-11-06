using System.Security.Claims;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Versatile.Application.Services;

namespace Versatile.Api.Hubs;

[Authorize]
public class CollaborationHub : Hub
{
    private const string JoinedStoriesItemKey = "versatile.collaboration.joined-stories";

    private readonly IStoryAccessChecker _access;

    public CollaborationHub(IStoryAccessChecker access)
    {
        _access = access;
    }

    private string OrgGroupPrefix => $"{Context.User!.FindFirstValue("org_id")}_";

    private Guid UserId => Guid.Parse(Context.User!.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    private Guid? OrganizationId =>
        Guid.TryParse(Context.User!.FindFirstValue("org_id"), out var orgId) ? orgId : null;

    private ConcurrentDictionary<Guid, byte> JoinedStories
    {
        get
        {
            if (Context.Items.TryGetValue(JoinedStoriesItemKey, out var value) &&
                value is ConcurrentDictionary<Guid, byte> joined)
                return joined;

            joined = new ConcurrentDictionary<Guid, byte>();
            Context.Items[JoinedStoriesItemKey] = joined;
            return joined;
        }
    }

    private string GroupName(Guid storyId) => $"{OrgGroupPrefix}collab_{storyId:D}";

    private Guid RequireJoinedStory(string storyId)
    {
        if (!Guid.TryParse(storyId, out var id) || !JoinedStories.ContainsKey(id))
            throw new HubException("Story not found.");
        return id;
    }

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

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(id));
        JoinedStories.TryAdd(id, 0);
    }

    public async Task LeaveStoryGroup(string storyId)
    {
        if (!Guid.TryParse(storyId, out var id))
            return;

        JoinedStories.TryRemove(id, out _);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(id));
    }

    public async Task CursorMoved(string storyId, string userId, string position)
    {
        var id = RequireJoinedStory(storyId);
        // Never trust a caller-supplied identity when broadcasting presence.
        _ = userId;
        await Clients.OthersInGroup(GroupName(id)).SendAsync("CursorMoved", UserId.ToString(), position);
    }

    public async Task ContentChanged(string storyId, string sceneId, string content)
    {
        var id = RequireJoinedStory(storyId);
        await Clients.OthersInGroup(GroupName(id)).SendAsync("ContentChanged", sceneId, content, UserId.ToString());
    }
}
