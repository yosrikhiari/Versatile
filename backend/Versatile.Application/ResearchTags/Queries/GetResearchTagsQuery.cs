using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchTags.Queries;

public record GetResearchTagsQuery(Guid StoryId, Guid UserId) : IRequest<List<ResearchTagDto>>;

public record GetResearchTagByIdQuery(Guid Id, Guid UserId) : IRequest<ResearchTagDto>;
