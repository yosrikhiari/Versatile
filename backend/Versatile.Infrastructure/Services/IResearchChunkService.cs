using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchChunkService
{
    Task<List<ResearchChunkDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ResearchChunkDto> GetByIdAsync(Guid id, Guid userId);
    Task<ResearchChunkDto> CreateAsync(Guid storyId, CreateResearchChunkRequest request, Guid userId);
    Task<ResearchChunkDto> UpdateAsync(Guid id, UpdateResearchChunkRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
