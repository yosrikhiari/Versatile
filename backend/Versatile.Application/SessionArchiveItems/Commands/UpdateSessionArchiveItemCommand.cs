using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Commands;

public record UpdateSessionArchiveItemCommand(Guid Id, string? Signal, string? Type, DateTime? Timestamp, string? Data, Guid? OrganizationId, Guid UserId) : IRequest<SessionArchiveItemDto>, IRequiresOrganization;
