using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Stories.Queries;

public record GetStoriesQuery(Guid UserId) : IRequest<List<StoryDto>>;

public record GetStoryByIdQuery(Guid Id, Guid UserId) : IRequest<StoryDto>;
