using FluentValidation;
using Versatile.Application.Subsection.Commands;

namespace Versatile.Application.Subsection.Validators;

public class CreateSubsectionValidator : AbstractValidator<CreateSubsectionCommand>
{
    public CreateSubsectionValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateSubsectionValidator : AbstractValidator<UpdateSubsectionCommand>
{
    public UpdateSubsectionValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteSubsectionValidator : AbstractValidator<DeleteSubsectionCommand>
{
    public DeleteSubsectionValidator() => RuleFor(v => v.Id).NotEmpty();
}
