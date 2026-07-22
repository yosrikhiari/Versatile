using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Versatile.Domain.Interfaces;
using SectionEntity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class CreateSectionHandler : IRequestHandler<CreateSectionCommand, SectionDto>
{
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSectionHandler(IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<SectionDto> Handle(CreateSectionCommand request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var all = await _sectionRepo.GetAllAsync(s => s.StoryId == request.StoryId);
        var maxOrder = all.Any() ? all.Max(s => s.Order) : 0;

        var section = new SectionEntity
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Status = request.Status ?? "Draft",
            Tags = request.Tags,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _sectionRepo.AddAsync(section);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(section);
    }

    private static SectionDto ToDto(SectionEntity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
