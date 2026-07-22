using MediatR;
using Versatile.Application.DailyGoals.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Handlers;
public class DeleteDailyGoalHandler : IRequestHandler<DeleteDailyGoalCommand, Unit>
{
    private readonly IRepository<DailyGoal> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public DeleteDailyGoalHandler(IRepository<DailyGoal> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<Unit> Handle(DeleteDailyGoalCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("DailyGoal not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("DailyGoal not found");
        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
