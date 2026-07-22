using FluentValidation;
using Versatile.Application.CharacterRelationships.Commands;
namespace Versatile.Application.CharacterRelationships.Validators;
public class CreateCharacterRelationshipValidator : AbstractValidator<CreateCharacterRelationshipCommand>
{
    public CreateCharacterRelationshipValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.RelationshipType).NotEmpty().MaximumLength(100);
    }
}
public class UpdateCharacterRelationshipValidator : AbstractValidator<UpdateCharacterRelationshipCommand>
{
    public UpdateCharacterRelationshipValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
public class DeleteCharacterRelationshipValidator : AbstractValidator<DeleteCharacterRelationshipCommand>
{
    public DeleteCharacterRelationshipValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
