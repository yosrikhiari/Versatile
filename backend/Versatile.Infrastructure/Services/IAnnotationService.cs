using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IAnnotationService
{
    Task<List<AnnotationDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<AnnotationDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<AnnotationDto> CreateAsync(Guid storyId, CreateAnnotationRequest request, Guid userId, Guid? organizationId);
    Task<AnnotationDto> UpdateAsync(Guid id, UpdateAnnotationRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
