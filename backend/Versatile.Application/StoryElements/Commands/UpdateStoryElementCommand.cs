using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Commands;

public record UpdateStoryElementCommand(Guid Id, string? Type, string? Title, double? X, double? Y, double? Width, double? Height, string? Data, Guid? OrganizationId, Guid UserId) : IRequest<StoryElementDto>, IRequiresOrganization;
