using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IAuthorProfileService
{
    Task<List<AuthorProfileDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<AuthorProfileDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<AuthorProfileDto> CreateAsync(Guid storyId, CreateAuthorProfileRequest request, Guid userId, Guid? organizationId = null);
    Task<AuthorProfileDto> UpdateAsync(Guid id, UpdateAuthorProfileRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
