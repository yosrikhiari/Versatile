using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISparkHistoryItemService
{
    Task<List<SparkHistoryItemDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<SparkHistoryItemDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<SparkHistoryItemDto> CreateAsync(Guid storyId, CreateSparkHistoryItemRequest request, Guid userId, Guid? organizationId = null);
    Task<SparkHistoryItemDto> UpdateAsync(Guid id, UpdateSparkHistoryItemRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
