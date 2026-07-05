using Versatile.Application.DTOs;

namespace Versatile.Application.Services;

public interface IGeneratedStoryService
{
    Task<List<GeneratedStoryDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<GeneratedStoryDto> GetByIdAsync(Guid id, Guid userId);
    Task<GeneratedStoryDto> CreateAsync(Guid storyId, CreateGeneratedStoryRequest request, Guid userId);
    Task<GeneratedStoryDto> UpdateAsync(Guid id, UpdateGeneratedStoryRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
