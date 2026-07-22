using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VoiceProfiles.Commands;

public record CreateVoiceProfileCommand(Guid StoryId, string Name, string? Settings, Guid? OrganizationId, Guid UserId) : IRequest<VoiceProfileDto>, IRequiresOrganization;
