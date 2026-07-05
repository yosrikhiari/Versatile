using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGraphGroupService
{
    Task<List<GraphGroupDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<GraphGroupDto> GetByIdAsync(Guid id, Guid userId);
    Task<GraphGroupDto> CreateAsync(Guid storyId, CreateGraphGroupRequest request, Guid userId);
    Task<GraphGroupDto> UpdateAsync(Guid id, UpdateGraphGroupRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
