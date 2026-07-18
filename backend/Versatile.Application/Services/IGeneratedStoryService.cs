using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IGeneratedStoryService
{
    Task<List<GeneratedStoryDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<GeneratedStoryDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<GeneratedStoryDto> CreateAsync(Guid storyId, CreateGeneratedStoryRequest request, Guid userId, Guid? organizationId = null);
    Task<GeneratedStoryDto> UpdateAsync(Guid id, UpdateGeneratedStoryRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
