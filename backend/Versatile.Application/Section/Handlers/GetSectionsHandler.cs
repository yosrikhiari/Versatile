using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Queries;
using Versatile.Domain.Interfaces;
using SectionEntity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class GetSectionsHandler : IRequestHandler<GetSectionsQuery, List<SectionDto>>
{
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetSectionsHandler(IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
    }

    public async Task<List<SectionDto>> Handle(GetSectionsQuery request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var sections = await _sectionRepo.GetAllAsync(s => s.StoryId == request.StoryId);
        return sections.OrderBy(s => s.Order).Select(ToDto).ToList();
    }

    private static SectionDto ToDto(SectionEntity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}

public class GetSectionByIdHandler : IRequestHandler<GetSectionByIdQuery, SectionDto>
{
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetSectionByIdHandler(IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
    }

    public async Task<SectionDto> Handle(GetSectionByIdQuery request, CancellationToken ct)
    {
        var section = await _sectionRepo.GetByIdAsync(request.Id, ct);
        if (section is null)
            throw new KeyNotFoundException("Section not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(section.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Section not found");

        return ToDto(section);
    }

    private static SectionDto ToDto(SectionEntity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
