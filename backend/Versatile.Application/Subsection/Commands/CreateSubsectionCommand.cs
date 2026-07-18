using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Subsection.Commands;

public record CreateSubsectionCommand(Guid StoryId, Guid SectionId, string Title, string? Summary, string? Content, string? Tags, Guid? OrganizationId, Guid UserId) : IRequest<SubsectionDto>, IRequiresOrganization;
