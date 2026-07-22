using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.Entities.Commands;
public record UpdateEntityCommand(Guid Id, string? Name, string? Type, string? Description, string? Metadata, Guid? OrganizationId, Guid UserId) : IRequest<EntityDto>, IRequiresOrganization;
