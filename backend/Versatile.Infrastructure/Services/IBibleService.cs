using Versatile.Application.DTOs;

namespace Versatile.Infrastructure.Services;

public interface IBibleService
{
    Task<List<BibleEntryDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<BibleEntryDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<BibleEntryDto> CreateAsync(Guid storyId, CreateBibleEntryRequest request, Guid userId, Guid? organizationId = null);
    Task<BibleEntryDto> UpdateAsync(Guid id, UpdateBibleEntryRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
