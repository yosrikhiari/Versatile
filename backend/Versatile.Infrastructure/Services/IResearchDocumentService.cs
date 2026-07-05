using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchDocumentService
{
    Task<List<ResearchDocumentDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<ResearchDocumentDto> GetByIdAsync(Guid id, Guid userId);
    Task<ResearchDocumentDto> CreateAsync(Guid storyId, CreateResearchDocumentRequest request, Guid userId);
    Task<ResearchDocumentDto> UpdateAsync(Guid id, UpdateResearchDocumentRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
