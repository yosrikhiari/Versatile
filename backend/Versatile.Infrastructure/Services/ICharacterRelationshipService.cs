using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ICharacterRelationshipService
{
    Task<List<CharacterRelationshipDto>> GetAllAsync(Guid storyId, Guid userId);
    Task<CharacterRelationshipDto> GetByIdAsync(Guid id, Guid userId);
    Task<CharacterRelationshipDto> CreateAsync(Guid storyId, CreateCharacterRelationshipRequest request, Guid userId);
    Task<CharacterRelationshipDto> UpdateAsync(Guid id, UpdateCharacterRelationshipRequest request, Guid userId);
    Task DeleteAsync(Guid id, Guid userId);
}
