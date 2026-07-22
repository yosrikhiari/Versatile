using FluentValidation;
using Versatile.Application.Entities.Commands;
namespace Versatile.Application.Entities.Validators;
public class CreateEntityValidator : AbstractValidator<CreateEntityCommand>
{
    public CreateEntityValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Name).NotEmpty().MaximumLength(200);
        RuleFor(v => v.Type).NotEmpty().MaximumLength(100);
    }
}
public class UpdateEntityValidator : AbstractValidator<UpdateEntityCommand>
{
    public UpdateEntityValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
public class DeleteEntityValidator : AbstractValidator<DeleteEntityCommand>
{
    public DeleteEntityValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
