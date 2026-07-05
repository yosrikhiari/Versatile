using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;

namespace Versatile.Application.Stories.Handlers;

public class GetStoryByIdHandler : IRequestHandler<GetStoryByIdQuery, StoryDto>
{
    private readonly DbContext _db;

    public GetStoryByIdHandler(DbContext db) => _db = db;

    public async Task<StoryDto> Handle(GetStoryByIdQuery request, CancellationToken ct)
    {
        var story = await _db.Set<Story>()
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Story not found");

        return new StoryDto(story.Id, story.Title, story.Premise, story.Genre, story.Tone, story.WritingStyle, story.TargetAudience, story.CreatedAt, story.UpdatedAt);
    }
}
