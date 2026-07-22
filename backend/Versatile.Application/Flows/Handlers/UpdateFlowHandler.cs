using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Flows.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Flows.Handlers;

public class UpdateFlowHandler : IRequestHandler<UpdateFlowCommand, FlowDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Flow> _flows;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateFlowHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Flow> flows,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _flows = flows;
        _unitOfWork = unitOfWork;
    }

    public async Task<FlowDto> Handle(UpdateFlowCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var existing = await _flows.GetAllAsync(f => f.StoryId == request.StoryId, ct);
        var flow = existing.FirstOrDefault();

        if (flow is null)
        {
            flow = new Flow
            {
                StoryId = request.StoryId,
                Nodes = request.Nodes,
                Edges = request.Edges,
                Viewport = request.Viewport,
                UserId = request.UserId,
                OrganizationId = request.OrganizationId
            };
            await _flows.AddAsync(flow, ct);
        }
        else
        {
            flow.Nodes = request.Nodes;
            flow.Edges = request.Edges;
            flow.Viewport = request.Viewport;
            flow.UpdatedAt = DateTime.UtcNow;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new FlowDto(flow.Id, flow.StoryId, flow.Nodes, flow.Edges, flow.Viewport, flow.UpdatedAt);
    }
}
