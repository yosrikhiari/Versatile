using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class FlowService : IFlowService
{
    private readonly ApplicationDbContext _db;

    public FlowService(ApplicationDbContext db) => _db = db;

    public async Task<FlowDto> GetAsync(Guid storyId, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        var flow = await _db.Flows.FirstOrDefaultAsync(f => f.StoryId == storyId);
        return flow is null ? throw new KeyNotFoundException("Flow not found for this story") : ToDto(flow);
    }

    public async Task<FlowDto> UpsertAsync(Guid storyId, UpdateFlowRequest request, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        var flow = await _db.Flows.FirstOrDefaultAsync(f => f.StoryId == storyId);
        if (flow is null)
        {
            flow = new Flow { StoryId = storyId };
            _db.Flows.Add(flow);
        }

        flow.Nodes = request.Nodes;
        flow.Edges = request.Edges;
        flow.Viewport = request.Viewport;
        flow.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(flow);
    }

    private async Task EnsureAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static FlowDto ToDto(Flow f) => new(f.Id, f.StoryId, f.Nodes, f.Edges, f.Viewport, f.UpdatedAt);
}
