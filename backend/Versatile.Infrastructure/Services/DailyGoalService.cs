using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class DailyGoalService : IDailyGoalService
{
    private readonly ApplicationDbContext _db;
    public DailyGoalService(ApplicationDbContext db) => _db = db;

    public async Task<List<DailyGoalDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.DailyGoals.Where(d => d.StoryId == storyId).OrderByDescending(d => d.Date).Select(d => ToDto(d)).ToListAsync();
    }

    public async Task<DailyGoalDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var goal = await _db.DailyGoals.Include(d => d.Story).FirstOrDefaultAsync(d => d.Id == id && d.Story!.UserId == userId && (organizationId == null || d.Story!.OrganizationId == organizationId));
        return goal is null ? throw new KeyNotFoundException("DailyGoal not found") : ToDto(goal);
    }

    public async Task<DailyGoalDto> CreateAsync(Guid storyId, CreateDailyGoalRequest request, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var goal = new DailyGoal { StoryId = storyId, Date = request.Date, TargetWords = request.TargetWords, CurrentWords = request.CurrentWords ?? 0, Completed = request.Completed ?? false };
        _db.DailyGoals.Add(goal);
        await _db.SaveChangesAsync();
        return ToDto(goal);
    }

    public async Task<DailyGoalDto> UpdateAsync(Guid id, UpdateDailyGoalRequest request, Guid userId, Guid? organizationId)
    {
        var goal = await _db.DailyGoals.Include(d => d.Story).FirstOrDefaultAsync(d => d.Id == id && d.Story!.UserId == userId && (organizationId == null || d.Story!.OrganizationId == organizationId));
        if (goal is null) throw new KeyNotFoundException("DailyGoal not found");
        if (request.Date.HasValue) goal.Date = request.Date.Value;
        if (request.TargetWords.HasValue) goal.TargetWords = request.TargetWords.Value;
        if (request.CurrentWords.HasValue) goal.CurrentWords = request.CurrentWords.Value;
        if (request.Completed.HasValue) goal.Completed = request.Completed.Value;
        await _db.SaveChangesAsync();
        return ToDto(goal);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var goal = await _db.DailyGoals.Include(d => d.Story).FirstOrDefaultAsync(d => d.Id == id && d.Story!.UserId == userId && (organizationId == null || d.Story!.OrganizationId == organizationId));
        if (goal is null) throw new KeyNotFoundException("DailyGoal not found");
        _db.DailyGoals.Remove(goal);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static DailyGoalDto ToDto(DailyGoal d) => new(d.Id, d.StoryId, d.Date, d.TargetWords, d.CurrentWords, d.Completed);
}
