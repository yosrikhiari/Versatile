using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISnapshotService
{
    Task<List<SnapshotDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<SnapshotDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<SnapshotDto> CreateAsync(Guid storyId, CreateSnapshotRequest request, Guid userId, Guid? organizationId = null);
    Task<SnapshotDto> UpdateAsync(Guid id, UpdateSnapshotRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
