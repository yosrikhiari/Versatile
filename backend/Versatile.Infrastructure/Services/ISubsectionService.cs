using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISubsectionService
{
    Task<List<SubsectionDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SubsectionDto> GetByIdAsync(Guid id, Guid userId);
    Task<SubsectionDto> CreateAsync(Guid storyId, CreateSubsectionRequest request, Guid userId);
    Task<SubsectionDto> UpdateAsync(Guid id, UpdateSubsectionRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
