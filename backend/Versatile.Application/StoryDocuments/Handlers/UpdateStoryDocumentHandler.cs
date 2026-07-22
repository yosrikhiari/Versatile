using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Handlers;

public class UpdateStoryDocumentHandler : IRequestHandler<UpdateStoryDocumentCommand, StoryDocumentDto>
{
    private readonly IRepository<StoryDocument> _documents;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateStoryDocumentHandler(
        IRepository<StoryDocument> documents,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _documents = documents;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryDocumentDto> Handle(UpdateStoryDocumentCommand request, CancellationToken ct)
    {
        var document = await _documents.GetByIdAsync(request.Id, ct);
        if (document is null)
            throw new KeyNotFoundException("StoryDocument not found");

        var story = await _stories.GetByIdForOrganizationAsync(document.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryDocument not found");

        if (request.DocType is not null) document.DocType = request.DocType;
        if (request.Title is not null) document.Title = request.Title;
        if (request.Content is not null) document.Content = request.Content;
        document.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(document);
    }

    private static StoryDocumentDto ToDto(StoryDocument d) => new(
        d.Id, d.StoryId, d.DocType, d.Title, d.Content, d.CreatedAt, d.UpdatedAt
    );
}
