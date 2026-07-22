using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryDocuments.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Handlers;

public class GetStoryDocumentsHandler : IRequestHandler<GetStoryDocumentsQuery, List<StoryDocumentDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<StoryDocument> _documents;

    public GetStoryDocumentsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<StoryDocument> documents)
    {
        _stories = stories;
        _documents = documents;
    }

    public async Task<List<StoryDocumentDto>> Handle(GetStoryDocumentsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var documents = await _documents.GetAllAsync(d => d.StoryId == request.StoryId, ct);
        return documents.Select(ToDto).ToList();
    }

    private static StoryDocumentDto ToDto(StoryDocument d) => new(
        d.Id, d.StoryId, d.DocType, d.Title, d.Content, d.CreatedAt, d.UpdatedAt
    );
}

public class GetStoryDocumentByIdHandler : IRequestHandler<GetStoryDocumentByIdQuery, StoryDocumentDto>
{
    private readonly IRepository<StoryDocument> _documents;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetStoryDocumentByIdHandler(
        IRepository<StoryDocument> documents,
        IOrganizationOwnedRepository<Story> stories)
    {
        _documents = documents;
        _stories = stories;
    }

    public async Task<StoryDocumentDto> Handle(GetStoryDocumentByIdQuery request, CancellationToken ct)
    {
        var document = await _documents.GetByIdAsync(request.Id, ct);
        if (document is null)
            throw new KeyNotFoundException("StoryDocument not found");

        var story = await _stories.GetByIdForOrganizationAsync(document.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryDocument not found");

        return ToDto(document);
    }

    private static StoryDocumentDto ToDto(StoryDocument d) => new(
        d.Id, d.StoryId, d.DocType, d.Title, d.Content, d.CreatedAt, d.UpdatedAt
    );
}
