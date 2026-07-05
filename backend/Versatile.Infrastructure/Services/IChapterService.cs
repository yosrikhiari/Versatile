using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IChapterService
{
    Task<List<ChapterDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ChapterDto> GetByIdAsync(Guid id, Guid userId);
    Task<ChapterDto> CreateAsync(Guid storyId, CreateChapterRequest request, Guid userId);
    Task<ChapterDto> UpdateAsync(Guid id, UpdateChapterRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
