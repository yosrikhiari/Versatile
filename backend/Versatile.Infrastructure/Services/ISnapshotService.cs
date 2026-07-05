using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISnapshotService
{
    Task<List<SnapshotDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SnapshotDto> GetByIdAsync(Guid id, Guid userId);
    Task<SnapshotDto> CreateAsync(Guid storyId, CreateSnapshotRequest request, Guid userId);
    Task<SnapshotDto> UpdateAsync(Guid id, UpdateSnapshotRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
