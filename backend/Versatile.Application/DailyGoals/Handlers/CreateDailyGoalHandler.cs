using MediatR;
using Versatile.Application.DailyGoals.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Handlers;
public class CreateDailyGoalHandler : IRequestHandler<CreateDailyGoalCommand, DailyGoalDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<DailyGoal> _entities;
    private readonly IUnitOfWork _unitOfWork;
    public CreateDailyGoalHandler(IOrganizationOwnedRepository<Story> stories, IRepository<DailyGoal> entities, IUnitOfWork unitOfWork)
    { _stories = stories; _entities = entities; _unitOfWork = unitOfWork; }
    public async Task<DailyGoalDto> Handle(CreateDailyGoalCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var entity = new DailyGoal { StoryId = request.StoryId, Date = request.Date, TargetWords = request.TargetWords, UserId = request.UserId, OrganizationId = request.OrganizationId };
        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static DailyGoalDto ToDto(DailyGoal e) => new(e.Id, e.StoryId, e.Date, e.TargetWords, e.CurrentWords, e.Completed);
}
