using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Commands;

public record UpdateSceneCommand(Guid Id, string? Title, string? Content, string? Status, int? Order, Guid? OrganizationId, Guid UserId) : IRequest<SceneDto>, IRequiresOrganization;
