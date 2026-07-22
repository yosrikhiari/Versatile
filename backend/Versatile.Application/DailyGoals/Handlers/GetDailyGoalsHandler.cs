using MediatR;
using Versatile.Application.DailyGoals.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Handlers;
public class GetDailyGoalsHandler : IRequestHandler<GetDailyGoalsQuery, List<DailyGoalDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<DailyGoal> _entities;
    public GetDailyGoalsHandler(IOrganizationOwnedRepository<Story> stories, IRepository<DailyGoal> entities) { _stories = stories; _entities = entities; }
    public async Task<List<DailyGoalDto>> Handle(GetDailyGoalsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var items = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return items.Select(e => ToDto(e)).ToList();
    }
    private static DailyGoalDto ToDto(DailyGoal e) => new(e.Id, e.StoryId, e.Date, e.TargetWords, e.CurrentWords, e.Completed);
}
public class GetDailyGoalByIdHandler : IRequestHandler<GetDailyGoalByIdQuery, DailyGoalDto>
{
    private readonly IRepository<DailyGoal> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    public GetDailyGoalByIdHandler(IRepository<DailyGoal> entities, IOrganizationOwnedRepository<Story> stories) { _entities = entities; _stories = stories; }
    public async Task<DailyGoalDto> Handle(GetDailyGoalByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("DailyGoal not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("DailyGoal not found");
        return ToDto(entity);
    }
    private static DailyGoalDto ToDto(DailyGoal e) => new(e.Id, e.StoryId, e.Date, e.TargetWords, e.CurrentWords, e.Completed);
}
