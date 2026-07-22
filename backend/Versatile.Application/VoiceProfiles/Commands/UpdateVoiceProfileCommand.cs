using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VoiceProfiles.Commands;

public record UpdateVoiceProfileCommand(Guid Id, string? Name, string? Settings, Guid? OrganizationId, Guid UserId) : IRequest<VoiceProfileDto>, IRequiresOrganization;
