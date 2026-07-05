using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchTagService
{
    Task<List<ResearchTagDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ResearchTagDto> GetByIdAsync(Guid id, Guid userId);
    Task<ResearchTagDto> CreateAsync(Guid storyId, CreateResearchTagRequest request, Guid userId);
    Task<ResearchTagDto> UpdateAsync(Guid id, UpdateResearchTagRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
