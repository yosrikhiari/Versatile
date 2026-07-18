using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface ISceneService
{
    Task<List<SceneDto>> GetAllAsync(Guid chapterId, Guid userId, Guid? organizationId = null);
    Task<SceneDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<SceneDto> CreateAsync(Guid chapterId, CreateSceneRequest request, Guid userId, Guid? organizationId = null);
    Task<SceneDto> UpdateAsync(Guid id, UpdateSceneRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
