using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Section.Queries;

public record GetSectionsQuery(Guid StoryId, Guid UserId) : IRequest<List<SectionDto>>;
public record GetSectionByIdQuery(Guid Id, Guid UserId) : IRequest<SectionDto>;
