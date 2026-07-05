using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISparkHistoryItemService
{
    Task<List<SparkHistoryItemDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SparkHistoryItemDto> GetByIdAsync(Guid id, Guid userId);
    Task<SparkHistoryItemDto> CreateAsync(Guid storyId, CreateSparkHistoryItemRequest request, Guid userId);
    Task<SparkHistoryItemDto> UpdateAsync(Guid id, UpdateSparkHistoryItemRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
