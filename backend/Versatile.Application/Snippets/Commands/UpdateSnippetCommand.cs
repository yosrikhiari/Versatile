using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Commands;

public record UpdateSnippetCommand(Guid Id, string? Word, int? Count, DateTime? LastSeen, Guid? OrganizationId, Guid UserId) : IRequest<SnippetDto>, IRequiresOrganization;
