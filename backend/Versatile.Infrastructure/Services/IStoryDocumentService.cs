using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryDocumentService
{
    Task<List<StoryDocumentDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<StoryDocumentDto> GetByIdAsync(Guid id, Guid userId);
    Task<StoryDocumentDto> CreateAsync(Guid storyId, CreateStoryDocumentRequest request, Guid userId);
    Task<StoryDocumentDto> UpdateAsync(Guid id, UpdateStoryDocumentRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
