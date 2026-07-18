using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IResearchDocumentService
{
    Task<List<ResearchDocumentDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<ResearchDocumentDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<ResearchDocumentDto> CreateAsync(Guid storyId, CreateResearchDocumentRequest request, Guid userId, Guid? organizationId = null);
    Task<ResearchDocumentDto> UpdateAsync(Guid id, UpdateResearchDocumentRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
