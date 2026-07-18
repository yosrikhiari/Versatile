using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IEntityService
{
    Task<List<EntityDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<EntityDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<EntityDto> CreateAsync(Guid storyId, CreateEntityRequest request, Guid userId, Guid? organizationId);
    Task<EntityDto> UpdateAsync(Guid id, UpdateEntityRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
