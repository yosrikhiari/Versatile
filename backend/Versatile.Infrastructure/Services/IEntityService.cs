using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IEntityService
{
    Task<List<EntityDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<EntityDto> GetByIdAsync(Guid id, Guid userId);
    Task<EntityDto> CreateAsync(Guid storyId, CreateEntityRequest request, Guid userId);
    Task<EntityDto> UpdateAsync(Guid id, UpdateEntityRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
