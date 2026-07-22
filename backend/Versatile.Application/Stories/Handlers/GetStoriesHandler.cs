using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class GetStoriesHandler : IRequestHandler<GetStoriesQuery, PagedResponse<StoryDto>>
{
    private readonly IRepository<Story> _repo;

    public GetStoriesHandler(IRepository<Story> repo) => _repo = repo;

    public async Task<PagedResponse<StoryDto>> Handle(GetStoriesQuery request, CancellationToken ct)
    {
        var (stories, totalCount) = await _repo.GetPagedAsync(
            s => s.UserId == request.UserId && s.OrganizationId == request.OrganizationId,
            request.Page, request.PageSize, ct);
        var items = stories.OrderByDescending(s => s.UpdatedAt)
            .Select(s => new StoryDto(s.Id, s.Title, s.Premise, s.Genre, s.Tone, s.WritingStyle, s.TargetAudience, s.CreatedAt, s.UpdatedAt))
            .ToList();
        return new PagedResponse<StoryDto>(items, totalCount, request.Page, request.PageSize);
    }
}
