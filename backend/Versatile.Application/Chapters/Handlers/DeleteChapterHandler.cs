using MediatR;
using Versatile.Application.Chapters.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Handlers;

public class DeleteChapterHandler : IRequestHandler<DeleteChapterCommand, Unit>
{
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteChapterHandler(
        IOrganizationOwnedRepository<Chapter> chapters,
        IUnitOfWork unitOfWork)
    {
        _chapters = chapters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteChapterCommand request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.Id, request.OrganizationId.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        _chapters.Delete(chapter);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
