using System.Linq.Expressions;
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
        Expression<Func<Story, bool>> filter = s => s.UserId == request.UserId && s.OrganizationId == request.OrganizationId;

        if (request.AfterId.HasValue)
        {
            var (stories, hasNextPage) = await _repo.GetPagedKeysetAsync(
                filter, request.PageSize, request.AfterId,
                q => q.OrderByDescending(s => s.UpdatedAt), ct);
            var items = stories.Select(s => new StoryDto(s.Id, s.Title, s.Premise, s.Genre, s.Tone, s.WritingStyle, s.TargetAudience, s.CreatedAt, s.UpdatedAt)).ToList();
            return new PagedResponse<StoryDto>(items, 0, 0, request.PageSize, hasNextPage ? items.Last().Id : null);
        }

        var (storiesPaged, totalCount) = await _repo.GetPagedAsync(
            filter, request.Page, request.PageSize,
            q => q.OrderByDescending(s => s.UpdatedAt), ct);
        var itemsPaged = storiesPaged.Select(s => new StoryDto(s.Id, s.Title, s.Premise, s.Genre, s.Tone, s.WritingStyle, s.TargetAudience, s.CreatedAt, s.UpdatedAt)).ToList();
        return new PagedResponse<StoryDto>(itemsPaged, totalCount, request.Page, request.PageSize);
    }
}
