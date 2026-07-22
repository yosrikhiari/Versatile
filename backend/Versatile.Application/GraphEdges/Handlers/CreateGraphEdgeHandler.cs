using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Handlers;

public class CreateGraphEdgeHandler : IRequestHandler<CreateGraphEdgeCommand, GraphEdgeDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GraphEdge> _edges;
    private readonly IUnitOfWork _unitOfWork;

    public CreateGraphEdgeHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GraphEdge> edges,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _edges = edges;
        _unitOfWork = unitOfWork;
    }

    public async Task<GraphEdgeDto> Handle(CreateGraphEdgeCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new GraphEdge
        {
            StoryId = request.StoryId,
            SourceId = request.SourceId,
            TargetId = request.TargetId,
            SourceType = request.SourceType,
            TargetType = request.TargetType,
            RelationshipType = request.RelationshipType,
            Label = request.Label,
            VolumeId = request.VolumeId,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _edges.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GraphEdgeDto ToDto(GraphEdge e) => new(
        e.Id, e.StoryId, e.SourceId, e.TargetId, e.SourceType, e.TargetType, e.RelationshipType, e.Label, e.VolumeId
    );
}
