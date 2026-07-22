using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Commands;

public record UpdateGeneratedStoryCommand(Guid Id, string? Title, string? Content, int? TotalWords, double? QualityScore, Guid? OrganizationId, Guid UserId) : IRequest<GeneratedStoryDto>, IRequiresOrganization;
