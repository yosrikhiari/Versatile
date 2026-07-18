using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryStateSnapshotService
{
    Task<List<StoryStateSnapshotDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<StoryStateSnapshotDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<StoryStateSnapshotDto> CreateAsync(Guid storyId, CreateStoryStateSnapshotRequest request, Guid userId, Guid? organizationId);
    Task<StoryStateSnapshotDto> UpdateAsync(Guid id, UpdateStoryStateSnapshotRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
