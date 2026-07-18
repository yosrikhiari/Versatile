using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Section.Commands;

public record CreateSectionCommand(Guid StoryId, string Title, string? Summary, string? Content, string? Status, string? Tags, Guid? OrganizationId, Guid UserId) : IRequest<SectionDto>, IRequiresOrganization;
