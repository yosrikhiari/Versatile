using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface IVoiceProfileService
{
    Task<List<VoiceProfileDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<VoiceProfileDto> GetByIdAsync(Guid id, Guid userId);
    Task<VoiceProfileDto> CreateAsync(Guid storyId, CreateVoiceProfileRequest request, Guid userId);
    Task<VoiceProfileDto> UpdateAsync(Guid id, UpdateVoiceProfileRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
