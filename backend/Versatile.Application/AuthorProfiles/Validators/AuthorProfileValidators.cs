using FluentValidation;
using Versatile.Application.AuthorProfiles.Commands;
namespace Versatile.Application.AuthorProfiles.Validators;
public class CreateAuthorProfileValidator : AbstractValidator<CreateAuthorProfileCommand>
{
    public CreateAuthorProfileValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.DisplayName).NotEmpty().MaximumLength(200);
        RuleFor(v => v.PenName).NotEmpty().MaximumLength(200);
    }
}
public class UpdateAuthorProfileValidator : AbstractValidator<UpdateAuthorProfileCommand>
{
    public UpdateAuthorProfileValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
public class DeleteAuthorProfileValidator : AbstractValidator<DeleteAuthorProfileCommand>
{
    public DeleteAuthorProfileValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
