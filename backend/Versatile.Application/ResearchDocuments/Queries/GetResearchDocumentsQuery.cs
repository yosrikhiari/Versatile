using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Queries;

public record GetResearchDocumentsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<ResearchDocumentDto>>, IRequiresOrganization;

public record GetResearchDocumentByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ResearchDocumentDto>, IRequiresOrganization;
