using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Commands;

public record UpdateStoryDocumentCommand(Guid Id, string? DocType, string? Title, string? Content, Guid? OrganizationId, Guid UserId) : IRequest<StoryDocumentDto>, IRequiresOrganization;
