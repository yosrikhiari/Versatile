using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Commands;
public record UpdateAuthorProfileCommand(Guid Id, string? DisplayName, string? PenName, string? Bio, string? Settings, Guid? OrganizationId, Guid UserId) : IRequest<AuthorProfileDto>, IRequiresOrganization;
