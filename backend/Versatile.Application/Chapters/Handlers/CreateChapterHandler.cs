using MediatR;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Handlers;

public class CreateChapterHandler : IRequestHandler<CreateChapterCommand, ChapterDto>
{
    private readonly IRepository<Story> _stories;
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IUnitOfWork _unitOfWork;

    public CreateChapterHandler(
        IRepository<Story> stories,
        IOrganizationOwnedRepository<Chapter> chapters,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _chapters = chapters;
        _unitOfWork = unitOfWork;
    }

    public async Task<ChapterDto> Handle(CreateChapterCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdAsync(request.StoryId, ct);
        if (story is null || story.UserId != request.UserId || story.OrganizationId != request.OrganizationId)
            throw new KeyNotFoundException("Story not found");

        var existing = await _chapters.GetAllAsync(c => c.StoryId == request.StoryId, ct);
        var maxOrder = existing.Count > 0 ? existing.Max(c => c.Order) : 0;

        var chapter = new Chapter
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            ArcAssignment = request.ArcAssignment,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _chapters.AddAsync(chapter, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
