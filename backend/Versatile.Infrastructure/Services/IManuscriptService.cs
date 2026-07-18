using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IManuscriptService
{
    Task<List<ManuscriptDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<ManuscriptDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<ManuscriptDto> CreateAsync(Guid storyId, CreateManuscriptRequest request, Guid userId, Guid? organizationId);
    Task<ManuscriptDto> UpdateAsync(Guid id, UpdateManuscriptRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
