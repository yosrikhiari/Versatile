using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchTagService
{
    Task<List<ResearchTagDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<ResearchTagDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<ResearchTagDto> CreateAsync(Guid storyId, CreateResearchTagRequest request, Guid userId, Guid? organizationId = null);
    Task<ResearchTagDto> UpdateAsync(Guid id, UpdateResearchTagRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
