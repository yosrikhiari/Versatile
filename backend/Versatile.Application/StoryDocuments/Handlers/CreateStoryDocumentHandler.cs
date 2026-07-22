using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Handlers;

public class CreateStoryDocumentHandler : IRequestHandler<CreateStoryDocumentCommand, StoryDocumentDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<StoryDocument> _documents;
    private readonly IUnitOfWork _unitOfWork;

    public CreateStoryDocumentHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<StoryDocument> documents,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _documents = documents;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryDocumentDto> Handle(CreateStoryDocumentCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var document = new StoryDocument
        {
            StoryId = request.StoryId,
            DocType = request.DocType,
            Title = request.Title,
            Content = request.Content,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _documents.AddAsync(document, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(document);
    }

    private static StoryDocumentDto ToDto(StoryDocument d) => new(
        d.Id, d.StoryId, d.DocType, d.Title, d.Content, d.CreatedAt, d.UpdatedAt
    );
}
