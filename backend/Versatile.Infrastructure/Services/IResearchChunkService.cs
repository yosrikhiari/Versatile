using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchChunkService
{
    Task<List<ResearchChunkDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<ResearchChunkDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<ResearchChunkDto> CreateAsync(Guid storyId, CreateResearchChunkRequest request, Guid userId, Guid? organizationId = null);
    Task<ResearchChunkDto> UpdateAsync(Guid id, UpdateResearchChunkRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
