using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryDocumentService
{
    Task<List<StoryDocumentDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<StoryDocumentDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<StoryDocumentDto> CreateAsync(Guid storyId, CreateStoryDocumentRequest request, Guid userId, Guid? organizationId);
    Task<StoryDocumentDto> UpdateAsync(Guid id, UpdateStoryDocumentRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
