using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Research.Queries;

public record GetResearchNotesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<ResearchDto>>, IRequiresOrganization;

public record GetResearchNoteByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ResearchDto>, IRequiresOrganization;
