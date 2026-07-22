using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Versatile.Domain.Interfaces;
using SectionEntity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class UpdateSectionHandler : IRequestHandler<UpdateSectionCommand, SectionDto>
{
    private readonly IRepository<SectionEntity> _sectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSectionHandler(IRepository<SectionEntity> sectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _sectionRepo = sectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<SectionDto> Handle(UpdateSectionCommand request, CancellationToken ct)
    {
        var section = await _sectionRepo.GetByIdAsync(request.Id, ct);
        if (section is null)
            throw new KeyNotFoundException("Section not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(section.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Section not found");

        if (request.Title is not null) section.Title = request.Title;
        if (request.Summary is not null) section.Summary = request.Summary;
        if (request.Content is not null) section.Content = request.Content;
        if (request.Order.HasValue) section.Order = request.Order.Value;
        if (request.Status is not null) section.Status = request.Status;
        if (request.Tags is not null) section.Tags = request.Tags;
        section.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(section);
    }

    private static SectionDto ToDto(SectionEntity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
