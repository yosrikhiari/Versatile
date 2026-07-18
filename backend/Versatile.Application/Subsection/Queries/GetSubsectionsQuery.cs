using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Subsection.Queries;

public record GetSubsectionsQuery(Guid StoryId, Guid UserId) : IRequest<List<SubsectionDto>>;
public record GetSubsectionByIdQuery(Guid Id, Guid UserId) : IRequest<SubsectionDto>;
