using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IResearchService
{
    Task<List<ResearchDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<ResearchDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<ResearchDto> CreateAsync(Guid storyId, CreateResearchRequest request, Guid userId, Guid? organizationId = null);
    Task<ResearchDto> UpdateAsync(Guid id, UpdateResearchRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
