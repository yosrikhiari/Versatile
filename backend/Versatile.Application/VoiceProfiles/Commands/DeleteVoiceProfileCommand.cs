using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VoiceProfiles.Commands;

public record DeleteVoiceProfileCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
