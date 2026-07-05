using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISectionService
{
    Task<List<SectionDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SectionDto> GetByIdAsync(Guid id, Guid userId);
    Task<SectionDto> CreateAsync(Guid storyId, CreateSectionRequest request, Guid userId);
    Task<SectionDto> UpdateAsync(Guid id, UpdateSectionRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
