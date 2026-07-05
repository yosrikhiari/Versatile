using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGraphEdgeService
{
    Task<List<GraphEdgeDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<GraphEdgeDto> GetByIdAsync(Guid id, Guid userId);
    Task<GraphEdgeDto> CreateAsync(Guid storyId, CreateGraphEdgeRequest request, Guid userId);
    Task<GraphEdgeDto> UpdateAsync(Guid id, UpdateGraphEdgeRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
