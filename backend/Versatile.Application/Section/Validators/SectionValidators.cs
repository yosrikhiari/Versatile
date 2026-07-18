using FluentValidation;
using Versatile.Application.Section.Commands;

namespace Versatile.Application.Section.Validators;

public class CreateSectionValidator : AbstractValidator<CreateSectionCommand>
{
    public CreateSectionValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateSectionValidator : AbstractValidator<UpdateSectionCommand>
{
    public UpdateSectionValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteSectionValidator : AbstractValidator<DeleteSectionCommand>
{
    public DeleteSectionValidator() => RuleFor(v => v.Id).NotEmpty();
}
