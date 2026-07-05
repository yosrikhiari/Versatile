using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IStoryService
{
    Task<List<StoryDto>> GetAllAsync(Guid userId);
    Task<StoryDto> GetByIdAsync(Guid id, Guid userId);
    Task<StoryDto> CreateAsync(CreateStoryRequest request, Guid userId);
    Task<StoryDto> UpdateAsync(Guid id, UpdateStoryRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
