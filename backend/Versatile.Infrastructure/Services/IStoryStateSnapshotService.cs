using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IStoryStateSnapshotService
{
    Task<List<StoryStateSnapshotDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<StoryStateSnapshotDto> GetByIdAsync(Guid id, Guid userId);
    Task<StoryStateSnapshotDto> CreateAsync(Guid storyId, CreateStoryStateSnapshotRequest request, Guid userId);
    Task<StoryStateSnapshotDto> UpdateAsync(Guid id, UpdateStoryStateSnapshotRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
