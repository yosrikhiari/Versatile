using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IAnnotationService
{
    Task<List<AnnotationDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<AnnotationDto> GetByIdAsync(Guid id, Guid userId);
    Task<AnnotationDto> CreateAsync(Guid storyId, CreateAnnotationRequest request, Guid userId);
    Task<AnnotationDto> UpdateAsync(Guid id, UpdateAnnotationRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
