using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Commands;
using Versatile.Domain.Interfaces;
using SubsectionEntity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class UpdateSubsectionHandler : IRequestHandler<UpdateSubsectionCommand, SubsectionDto>
{
    private readonly IRepository<SubsectionEntity> _subsectionRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSubsectionHandler(IRepository<SubsectionEntity> subsectionRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _subsectionRepo = subsectionRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<SubsectionDto> Handle(UpdateSubsectionCommand request, CancellationToken ct)
    {
        var subsection = await _subsectionRepo.GetByIdAsync(request.Id, ct);
        if (subsection is null)
            throw new KeyNotFoundException("Subsection not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(subsection.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Subsection not found");

        if (request.Title is not null) subsection.Title = request.Title;
        if (request.Summary is not null) subsection.Summary = request.Summary;
        if (request.Content is not null) subsection.Content = request.Content;
        if (request.Order.HasValue) subsection.Order = request.Order.Value;
        if (request.Tags is not null) subsection.Tags = request.Tags;
        subsection.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(subsection);
    }

    private static SubsectionDto ToDto(SubsectionEntity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
