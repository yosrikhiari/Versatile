using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Commands;

public record CreateResearchTagCommand(string Name, Guid StoryId, string? Color, Guid? OrganizationId, Guid UserId) : IRequest<ResearchTagDto>, IRequiresOrganization;
