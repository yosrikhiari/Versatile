using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Handlers;

public class UpdateGraphEdgeHandler : IRequestHandler<UpdateGraphEdgeCommand, GraphEdgeDto>
{
    private readonly IRepository<GraphEdge> _edges;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateGraphEdgeHandler(
        IRepository<GraphEdge> edges,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _edges = edges;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<GraphEdgeDto> Handle(UpdateGraphEdgeCommand request, CancellationToken ct)
    {
        var entity = await _edges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphEdge not found");

        if (request.SourceId is not null) entity.SourceId = request.SourceId;
        if (request.TargetId is not null) entity.TargetId = request.TargetId;
        if (request.SourceType is not null) entity.SourceType = request.SourceType;
        if (request.TargetType is not null) entity.TargetType = request.TargetType;
        if (request.RelationshipType is not null) entity.RelationshipType = request.RelationshipType;
        if (request.Label is not null) entity.Label = request.Label;
        if (request.VolumeId is not null) entity.VolumeId = request.VolumeId;
        entity.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GraphEdgeDto ToDto(GraphEdge e) => new(
        e.Id, e.StoryId, e.SourceId, e.TargetId, e.SourceType, e.TargetType, e.RelationshipType, e.Label, e.VolumeId
    );
}
