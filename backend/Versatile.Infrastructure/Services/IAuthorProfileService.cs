using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IAuthorProfileService
{
    Task<List<AuthorProfileDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<AuthorProfileDto> GetByIdAsync(Guid id, Guid userId);
    Task<AuthorProfileDto> CreateAsync(Guid storyId, CreateAuthorProfileRequest request, Guid userId);
    Task<AuthorProfileDto> UpdateAsync(Guid id, UpdateAuthorProfileRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
