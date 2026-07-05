using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IRevisionCommentService
{
    Task<List<RevisionCommentDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<RevisionCommentDto> GetByIdAsync(Guid id, Guid userId);
    Task<RevisionCommentDto> CreateAsync(Guid storyId, CreateRevisionCommentRequest request, Guid userId);
    Task<RevisionCommentDto> UpdateAsync(Guid id, UpdateRevisionCommentRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
