using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryDocuments.Commands;

public record DeleteStoryDocumentCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
