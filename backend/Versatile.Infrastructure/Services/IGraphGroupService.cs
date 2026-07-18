using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGraphGroupService
{
    Task<List<GraphGroupDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<GraphGroupDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<GraphGroupDto> CreateAsync(Guid storyId, CreateGraphGroupRequest request, Guid userId, Guid? organizationId = null);
    Task<GraphGroupDto> UpdateAsync(Guid id, UpdateGraphGroupRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
