using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IVolumeEntityService
{
    Task<List<VolumeEntityDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<VolumeEntityDto> GetByIdAsync(Guid id, Guid userId);
    Task<VolumeEntityDto> CreateAsync(Guid storyId, CreateVolumeEntityRequest request, Guid userId);
    Task<VolumeEntityDto> UpdateAsync(Guid id, UpdateVolumeEntityRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
