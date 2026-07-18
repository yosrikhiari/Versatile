using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;

namespace Versatile.Application.Stories.Handlers;

public class GetStoriesHandler : IRequestHandler<GetStoriesQuery, List<StoryDto>>
{
    private readonly DbContext _db;

    public GetStoriesHandler(DbContext db) => _db = db;

    public async Task<List<StoryDto>> Handle(GetStoriesQuery request, CancellationToken ct) =>
        await _db.Set<Story>()
            .Where(s => s.UserId == request.UserId && s.OrganizationId == request.OrganizationId)
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => new StoryDto(s.Id, s.Title, s.Premise, s.Genre, s.Tone, s.WritingStyle, s.TargetAudience, s.CreatedAt, s.UpdatedAt))
            .ToListAsync(ct);
}
