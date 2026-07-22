using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Queries;

public record GetStoryDocumentsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<StoryDocumentDto>>, IRequiresOrganization;

public record GetStoryDocumentByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<StoryDocumentDto>, IRequiresOrganization;
