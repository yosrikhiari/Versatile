using Versatile.Application.DTOs;
namespace Versatile.Infrastructure.Services;
public interface ICharacterRelationshipService
{
    Task<List<CharacterRelationshipDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId);
    Task<CharacterRelationshipDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId);
    Task<CharacterRelationshipDto> CreateAsync(Guid storyId, CreateCharacterRelationshipRequest request, Guid userId, Guid? organizationId);
    Task<CharacterRelationshipDto> UpdateAsync(Guid id, UpdateCharacterRelationshipRequest request, Guid userId, Guid? organizationId);
    Task DeleteAsync(Guid id, Guid userId, Guid? organizationId);
}
