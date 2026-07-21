using MediatR;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Handlers;

public class UpdateChapterHandler : IRequestHandler<UpdateChapterCommand, ChapterDto>
{
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateChapterHandler(
        IOrganizationOwnedRepository<Chapter> chapters,
        IUnitOfWork unitOfWork)
    {
        _chapters = chapters;
        _unitOfWork = unitOfWork;
    }

    public async Task<ChapterDto> Handle(UpdateChapterCommand request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.Id, request.OrganizationId.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        if (request.Title is not null) chapter.Title = request.Title;
        if (request.Order.HasValue) chapter.Order = request.Order.Value;
        if (request.Status is not null) chapter.Status = request.Status;
        if (request.ArcAssignment is not null) chapter.ArcAssignment = request.ArcAssignment;
        chapter.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
