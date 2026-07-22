using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Flows.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Flows.Handlers;

public class GetFlowHandler : IRequestHandler<GetFlowQuery, FlowDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Flow> _flows;

    public GetFlowHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Flow> flows)
    {
        _stories = stories;
        _flows = flows;
    }

    public async Task<FlowDto> Handle(GetFlowQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var flows = await _flows.GetAllAsync(f => f.StoryId == request.StoryId, ct);
        var flow = flows.FirstOrDefault();
        if (flow is null)
            throw new KeyNotFoundException("Flow not found");

        return new FlowDto(flow.Id, flow.StoryId, flow.Nodes, flow.Edges, flow.Viewport, flow.UpdatedAt);
    }
}
