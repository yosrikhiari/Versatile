using MediatR;
using Versatile.Application.StoryDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Handlers;

public class DeleteStoryDocumentHandler : IRequestHandler<DeleteStoryDocumentCommand, Unit>
{
    private readonly IRepository<StoryDocument> _documents;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteStoryDocumentHandler(
        IRepository<StoryDocument> documents,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _documents = documents;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteStoryDocumentCommand request, CancellationToken ct)
    {
        var document = await _documents.GetByIdAsync(request.Id, ct);
        if (document is null)
            throw new KeyNotFoundException("StoryDocument not found");

        var story = await _stories.GetByIdForOrganizationAsync(document.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryDocument not found");

        _documents.Delete(document);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
