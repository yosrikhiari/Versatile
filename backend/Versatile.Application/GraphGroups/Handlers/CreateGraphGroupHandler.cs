using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphGroups.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Handlers;

public class CreateGraphGroupHandler : IRequestHandler<CreateGraphGroupCommand, GraphGroupDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GraphGroup> _groups;
    private readonly IUnitOfWork _unitOfWork;

    public CreateGraphGroupHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GraphGroup> groups,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _groups = groups;
        _unitOfWork = unitOfWork;
    }

    public async Task<GraphGroupDto> Handle(CreateGraphGroupCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new GraphGroup
        {
            StoryId = request.StoryId,
            Label = request.Label,
            Color = request.Color,
            Data = request.Data,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _groups.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(entity);
    }

    private static GraphGroupDto ToDto(GraphGroup g) => new(
        g.Id, g.StoryId, g.Label, g.Color, g.Data
    );
}
