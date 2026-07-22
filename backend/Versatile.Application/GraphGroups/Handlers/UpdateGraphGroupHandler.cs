using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphGroups.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Handlers;

public class UpdateGraphGroupHandler : IRequestHandler<UpdateGraphGroupCommand, GraphGroupDto>
{
    private readonly IRepository<GraphGroup> _groups;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateGraphGroupHandler(
        IRepository<GraphGroup> groups,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _groups = groups;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<GraphGroupDto> Handle(UpdateGraphGroupCommand request, CancellationToken ct)
    {
        var entity = await _groups.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphGroup not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphGroup not found");

        if (request.Label is not null) entity.Label = request.Label;
        if (request.Color is not null) entity.Color = request.Color;
        if (request.Data is not null) entity.Data = request.Data;
        entity.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GraphGroupDto ToDto(GraphGroup g) => new(
        g.Id, g.StoryId, g.Label, g.Color, g.Data
    );
}
