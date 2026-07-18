using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface INodePositionService
{
    Task<List<NodePositionDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<NodePositionDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<NodePositionDto> CreateAsync(Guid storyId, CreateNodePositionRequest request, Guid userId, Guid? organizationId = null);
    Task<NodePositionDto> UpdateAsync(Guid id, UpdateNodePositionRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
