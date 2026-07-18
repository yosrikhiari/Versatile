using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IVolumeEntityService
{
    Task<List<VolumeEntityDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<VolumeEntityDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<VolumeEntityDto> CreateAsync(Guid storyId, CreateVolumeEntityRequest request, Guid userId, Guid? organizationId = null);
    Task<VolumeEntityDto> UpdateAsync(Guid id, UpdateVolumeEntityRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
