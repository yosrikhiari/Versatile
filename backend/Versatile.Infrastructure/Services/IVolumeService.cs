using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IVolumeService
{
    Task<List<VolumeDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<VolumeDto> GetByIdAsync(Guid id, Guid userId);
    Task<VolumeDto> CreateAsync(Guid storyId, CreateVolumeRequest request, Guid userId);
    Task<VolumeDto> UpdateAsync(Guid id, UpdateVolumeRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
