using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IDailyGoalService
{
    Task<List<DailyGoalDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<DailyGoalDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<DailyGoalDto> CreateAsync(Guid storyId, CreateDailyGoalRequest request, Guid userId, Guid? organizationId);
    Task<DailyGoalDto> UpdateAsync(Guid id, UpdateDailyGoalRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
