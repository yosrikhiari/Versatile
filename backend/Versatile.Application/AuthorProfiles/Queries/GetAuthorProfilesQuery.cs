using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Queries;
public record GetAuthorProfilesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<AuthorProfileDto>>, IRequiresOrganization;
public record GetAuthorProfileByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<AuthorProfileDto>, IRequiresOrganization;
