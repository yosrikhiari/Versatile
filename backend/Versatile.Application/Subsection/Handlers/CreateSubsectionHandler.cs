using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Commands;
using Versatile.Domain.Interfaces;
using SubsectionEntity = Versatile.Domain.Entities.Subsection;
using SectionEntity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class CreateSubsectionHandler : IRequestHandler<CreateSubsectionCommand, SubsectionDto>
{
    private readonly IRepository<SubsectionEntity> _subsectionRepo;
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSubsectionHandler(IRepository<SubsectionEntity> subsectionRepo, IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _subsectionRepo = subsectionRepo;
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<SubsectionDto> Handle(CreateSubsectionCommand request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var section = await _sectionRepo.GetByIdAsync(request.SectionId, ct);
        if (section is null || section.StoryId != request.StoryId)
            throw new KeyNotFoundException("Section not found");

        var all = await _subsectionRepo.GetAllAsync(s => s.StoryId == request.StoryId);
        var maxOrder = all.Any() ? all.Max(s => s.Order) : 0;

        var subsection = new SubsectionEntity
        {
            StoryId = request.StoryId,
            SectionId = request.SectionId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Tags = request.Tags,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _subsectionRepo.AddAsync(subsection);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(subsection);
    }

    private static SubsectionDto ToDto(SubsectionEntity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
