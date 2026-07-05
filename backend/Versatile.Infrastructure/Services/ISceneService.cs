using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface ISceneService
{
    Task<List<SceneDto>> GetAllAsync(Guid chapterId, Guid userId);
    Task<SceneDto> GetByIdAsync(Guid id, Guid userId);
    Task<SceneDto> CreateAsync(Guid chapterId, CreateSceneRequest request, Guid userId);
    Task<SceneDto> UpdateAsync(Guid id, UpdateSceneRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
