using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IStoryService
{
    Task<List<StoryDto>> GetAllAsync(Guid userId, Guid? organizationId = null);
    Task<StoryDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<StoryDto> CreateAsync(CreateStoryRequest request, Guid userId, Guid? organizationId = null);
    Task<StoryDto> UpdateAsync(Guid id, UpdateStoryRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
