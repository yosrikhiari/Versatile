using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGroupEdgeService
{
    Task<List<GroupEdgeDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<GroupEdgeDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<GroupEdgeDto> CreateAsync(Guid storyId, CreateGroupEdgeRequest request, Guid userId, Guid? organizationId = null);
    Task<GroupEdgeDto> UpdateAsync(Guid id, UpdateGroupEdgeRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
