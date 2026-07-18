using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryElementService
{
    Task<List<StoryElementDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<StoryElementDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<StoryElementDto> CreateAsync(Guid storyId, CreateStoryElementRequest request, Guid userId, Guid? organizationId);
    Task<StoryElementDto> UpdateAsync(Guid id, UpdateStoryElementRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
