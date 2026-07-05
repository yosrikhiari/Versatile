using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IDailyGoalService
{
    Task<List<DailyGoalDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<DailyGoalDto> GetByIdAsync(Guid id, Guid userId);
    Task<DailyGoalDto> CreateAsync(Guid storyId, CreateDailyGoalRequest request, Guid userId);
    Task<DailyGoalDto> UpdateAsync(Guid id, UpdateDailyGoalRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
