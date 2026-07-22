using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GroupEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Handlers;

public class CreateGroupEdgeHandler : IRequestHandler<CreateGroupEdgeCommand, GroupEdgeDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GroupEdge> _groupEdges;
    private readonly IUnitOfWork _unitOfWork;

    public CreateGroupEdgeHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GroupEdge> groupEdges,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _groupEdges = groupEdges;
        _unitOfWork = unitOfWork;
    }

    public async Task<GroupEdgeDto> Handle(CreateGroupEdgeCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new GroupEdge
        {
            StoryId = request.StoryId,
            SourceGroupId = request.SourceGroupId,
            TargetGroupId = request.TargetGroupId,
            RelationshipType = request.RelationshipType,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _groupEdges.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GroupEdgeDto ToDto(GroupEdge e) => new(
        e.Id, e.StoryId, e.SourceGroupId, e.TargetGroupId, e.RelationshipType
    );
}
