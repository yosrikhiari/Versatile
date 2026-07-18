using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IVoiceProfileService
{
    Task<List<VoiceProfileDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null);
    Task<VoiceProfileDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null);
    Task<VoiceProfileDto> CreateAsync(Guid storyId, CreateVoiceProfileRequest request, Guid userId, Guid? organizationId = null);
    Task<VoiceProfileDto> UpdateAsync(Guid id, UpdateVoiceProfileRequest request, Guid userId, Guid? organizationId = null);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null);
}
