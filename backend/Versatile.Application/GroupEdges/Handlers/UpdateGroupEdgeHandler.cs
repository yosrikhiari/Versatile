using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GroupEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Handlers;

public class UpdateGroupEdgeHandler : IRequestHandler<UpdateGroupEdgeCommand, GroupEdgeDto>
{
    private readonly IRepository<GroupEdge> _groupEdges;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateGroupEdgeHandler(
        IRepository<GroupEdge> groupEdges,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _groupEdges = groupEdges;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<GroupEdgeDto> Handle(UpdateGroupEdgeCommand request, CancellationToken ct)
    {
        var entity = await _groupEdges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GroupEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GroupEdge not found");

        if (request.SourceGroupId is not null) entity.SourceGroupId = request.SourceGroupId;
        if (request.TargetGroupId is not null) entity.TargetGroupId = request.TargetGroupId;
        if (request.RelationshipType is not null) entity.RelationshipType = request.RelationshipType;
        entity.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GroupEdgeDto ToDto(GroupEdge e) => new(
        e.Id, e.StoryId, e.SourceGroupId, e.TargetGroupId, e.RelationshipType
    );
}
