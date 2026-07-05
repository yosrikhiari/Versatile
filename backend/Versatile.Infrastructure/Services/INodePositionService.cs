using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface INodePositionService
{
    Task<List<NodePositionDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<NodePositionDto> GetByIdAsync(Guid id, Guid userId);
    Task<NodePositionDto> CreateAsync(Guid storyId, CreateNodePositionRequest request, Guid userId);
    Task<NodePositionDto> UpdateAsync(Guid id, UpdateNodePositionRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
