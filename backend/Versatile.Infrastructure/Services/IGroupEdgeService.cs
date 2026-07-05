using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IGroupEdgeService
{
    Task<List<GroupEdgeDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<GroupEdgeDto> GetByIdAsync(Guid id, Guid userId);
    Task<GroupEdgeDto> CreateAsync(Guid storyId, CreateGroupEdgeRequest request, Guid userId);
    Task<GroupEdgeDto> UpdateAsync(Guid id, UpdateGroupEdgeRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
