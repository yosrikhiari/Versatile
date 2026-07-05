using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ISnippetService
{
    Task<List<SnippetDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<SnippetDto> GetByIdAsync(Guid id, Guid userId);
    Task<SnippetDto> CreateAsync(Guid storyId, CreateSnippetRequest request, Guid userId);
    Task<SnippetDto> UpdateAsync(Guid id, UpdateSnippetRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
