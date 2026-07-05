using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryElementService
{
    Task<List<StoryElementDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<StoryElementDto> GetByIdAsync(Guid id, Guid userId);
    Task<StoryElementDto> CreateAsync(Guid storyId, CreateStoryElementRequest request, Guid userId);
    Task<StoryElementDto> UpdateAsync(Guid id, UpdateStoryElementRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
