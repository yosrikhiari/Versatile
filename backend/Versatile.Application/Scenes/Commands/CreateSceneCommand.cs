using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Commands;

public record CreateSceneCommand(Guid ChapterId, string Title, string Content, int Order, Guid? OrganizationId, Guid UserId) : IRequest<SceneDto>, IRequiresOrganization;
