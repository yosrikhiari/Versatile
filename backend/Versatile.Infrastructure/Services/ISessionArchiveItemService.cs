using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISessionArchiveItemService
{
    Task<List<SessionArchiveItemDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<SessionArchiveItemDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<SessionArchiveItemDto> CreateAsync(Guid storyId, CreateSessionArchiveItemRequest request, Guid userId, Guid? organizationId = null);
    Task<SessionArchiveItemDto> UpdateAsync(Guid id, UpdateSessionArchiveItemRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
