using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IChapterService
{
    Task<List<ChapterDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<ChapterDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<ChapterDto> CreateAsync(Guid storyId, CreateChapterRequest request, Guid userId, Guid? organizationId = null);
    Task<ChapterDto> UpdateAsync(Guid id, UpdateChapterRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
