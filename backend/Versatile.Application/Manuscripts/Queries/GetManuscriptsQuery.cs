using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Queries;

public record GetManuscriptsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<ManuscriptDto>>, IRequiresOrganization;

public record GetManuscriptByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ManuscriptDto>, IRequiresOrganization;
