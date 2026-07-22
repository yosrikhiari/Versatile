using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchDocuments.Queries;

public record GetResearchDocumentsQuery(Guid StoryId, Guid UserId) : IRequest<List<ResearchDocumentDto>>;

public record GetResearchDocumentByIdQuery(Guid Id, Guid UserId) : IRequest<ResearchDocumentDto>;
