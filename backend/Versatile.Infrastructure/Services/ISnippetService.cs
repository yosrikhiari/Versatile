using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISnippetService
{
    Task<List<SnippetDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<SnippetDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<SnippetDto> CreateAsync(Guid storyId, CreateSnippetRequest request, Guid userId, Guid? organizationId = null);
    Task<SnippetDto> UpdateAsync(Guid id, UpdateSnippetRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
