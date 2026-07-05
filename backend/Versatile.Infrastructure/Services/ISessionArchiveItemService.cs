using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISessionArchiveItemService
{
    Task<List<SessionArchiveItemDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SessionArchiveItemDto> GetByIdAsync(Guid id, Guid userId);
    Task<SessionArchiveItemDto> CreateAsync(Guid storyId, CreateSessionArchiveItemRequest request, Guid userId);
    Task<SessionArchiveItemDto> UpdateAsync(Guid id, UpdateSessionArchiveItemRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
