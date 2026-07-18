using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Versatile.Api.Hubs;

[Authorize]
public class CollaborationHub : Hub
{
    private string OrgGroupPrefix => $"{Context.User!.FindFirstValue("org_id")}_";

    public async Task JoinStoryGroup(string storyId)
    {
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
