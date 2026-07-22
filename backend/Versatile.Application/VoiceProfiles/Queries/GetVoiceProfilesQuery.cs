using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VoiceProfiles.Queries;

public record GetVoiceProfilesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<VoiceProfileDto>>, IRequiresOrganization;
public record GetVoiceProfileByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<VoiceProfileDto>, IRequiresOrganization;
