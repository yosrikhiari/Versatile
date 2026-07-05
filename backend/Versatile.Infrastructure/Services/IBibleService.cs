using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IBibleService
{
    Task<List<BibleEntryDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<BibleEntryDto> GetByIdAsync(Guid id, Guid userId);
    Task<BibleEntryDto> CreateAsync(Guid storyId, CreateBibleEntryRequest request, Guid userId);
    Task<BibleEntryDto> UpdateAsync(Guid id, UpdateBibleEntryRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
