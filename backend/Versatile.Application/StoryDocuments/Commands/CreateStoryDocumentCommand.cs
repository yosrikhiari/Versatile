using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Commands;

public record CreateStoryDocumentCommand(Guid StoryId, string DocType, string Title, string? Content, Guid? OrganizationId, Guid UserId) : IRequest<StoryDocumentDto>, IRequiresOrganization;
