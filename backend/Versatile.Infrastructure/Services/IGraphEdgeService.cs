using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGraphEdgeService
{
    Task<List<GraphEdgeDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<GraphEdgeDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<GraphEdgeDto> CreateAsync(Guid storyId, CreateGraphEdgeRequest request, Guid userId, Guid? organizationId = null);
    Task<GraphEdgeDto> UpdateAsync(Guid id, UpdateGraphEdgeRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
