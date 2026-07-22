using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class GetStoryByIdHandler : IRequestHandler<GetStoryByIdQuery, StoryDto>
{
    private readonly IRepository<Story> _repo;

    public GetStoryByIdHandler(IRepository<Story> repo) => _repo = repo;

    public async Task<StoryDto> Handle(GetStoryByIdQuery request, CancellationToken ct)
    {
        var stories = await _repo.GetAllAsync(
            s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        var story = stories.FirstOrDefault() ?? throw new KeyNotFoundException("Story not found");

        return new StoryDto(story.Id, story.Title, story.Premise, story.Genre, story.Tone, story.WritingStyle, story.TargetAudience, story.CreatedAt, story.UpdatedAt);
    }
}
