using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IManuscriptService
{
    Task<List<ManuscriptDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ManuscriptDto> GetByIdAsync(Guid id, Guid userId);
    Task<ManuscriptDto> CreateAsync(Guid storyId, CreateManuscriptRequest request, Guid userId);
    Task<ManuscriptDto> UpdateAsync(Guid id, UpdateManuscriptRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
