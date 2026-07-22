using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Research.Commands;

public record CreateResearchNoteCommand(Guid StoryId, string Title, string Content, Guid? OrganizationId, Guid UserId) : IRequest<ResearchDto>, IRequiresOrganization;
