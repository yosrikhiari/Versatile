using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IResearchService
{
    Task<List<ResearchDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ResearchDto> GetByIdAsync(Guid id, Guid userId);
    Task<ResearchDto> CreateAsync(Guid storyId, CreateResearchRequest request, Guid userId);
    Task<ResearchDto> UpdateAsync(Guid id, UpdateResearchRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
