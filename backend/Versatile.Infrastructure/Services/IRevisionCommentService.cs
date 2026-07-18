using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IRevisionCommentService
{
    Task<List<RevisionCommentDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<RevisionCommentDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<RevisionCommentDto> CreateAsync(Guid storyId, CreateRevisionCommentRequest request, Guid userId, Guid? organizationId = null);
    Task<RevisionCommentDto> UpdateAsync(Guid id, UpdateRevisionCommentRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
