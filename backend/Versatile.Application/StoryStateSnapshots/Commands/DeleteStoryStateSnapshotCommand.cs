using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryStateSnapshots.Commands;

public record DeleteStoryStateSnapshotCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
