using MediatR;
using Versatile.Application.DailyGoals.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Handlers;
public class UpdateDailyGoalHandler : IRequestHandler<UpdateDailyGoalCommand, DailyGoalDto>
{
    private readonly IRepository<DailyGoal> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public UpdateDailyGoalHandler(IRepository<DailyGoal> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<DailyGoalDto> Handle(UpdateDailyGoalCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("DailyGoal not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("DailyGoal not found");
        if (request.Date.HasValue) entity.Date = request.Date.Value;
        if (request.TargetWords.HasValue) entity.TargetWords = request.TargetWords.Value;
        if (request.CurrentWords.HasValue) entity.CurrentWords = request.CurrentWords.Value;
        if (request.Completed.HasValue) entity.Completed = request.Completed.Value;
        entity.UpdatedAt = DateTime.UtcNow;
        _entities.Update(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static DailyGoalDto ToDto(DailyGoal e) => new(e.Id, e.StoryId, e.Date, e.TargetWords, e.CurrentWords, e.Completed);
}
