using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Queries;
using Versatile.Domain.Interfaces;
using SubsectionEntity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class GetSubsectionsHandler : IRequestHandler<GetSubsectionsQuery, List<SubsectionDto>>
{
    private readonly IRepository<SubsectionEntity> _subsectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetSubsectionsHandler(IRepository<SubsectionEntity> subsectionRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _subsectionRepo = subsectionRepo;
        _storyRepo = storyRepo;
    }

    public async Task<List<SubsectionDto>> Handle(GetSubsectionsQuery request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var subsections = await _subsectionRepo.GetAllAsync(s => s.StoryId == request.StoryId);
        return subsections.OrderBy(s => s.Order).Select(ToDto).ToList();
    }

    private static SubsectionDto ToDto(SubsectionEntity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}

public class GetSubsectionByIdHandler : IRequestHandler<GetSubsectionByIdQuery, SubsectionDto>
{
    private readonly IRepository<SubsectionEntity> _subsectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetSubsectionByIdHandler(IRepository<SubsectionEntity> subsectionRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _subsectionRepo = subsectionRepo;
        _storyRepo = storyRepo;
    }

    public async Task<SubsectionDto> Handle(GetSubsectionByIdQuery request, CancellationToken ct)
    {
        var subsection = await _subsectionRepo.GetByIdAsync(request.Id, ct);
        if (subsection is null)
            throw new KeyNotFoundException("Subsection not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(subsection.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Subsection not found");

        return ToDto(subsection);
    }

    private static SubsectionDto ToDto(SubsectionEntity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
