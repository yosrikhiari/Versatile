using MediatR;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.AuthorProfiles.Commands;
public record DeleteAuthorProfileCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
