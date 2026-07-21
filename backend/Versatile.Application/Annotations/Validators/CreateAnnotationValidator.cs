using FluentValidation;
using Versatile.Application.Annotations.Commands;

namespace Versatile.Application.Annotations.Validators;

public class CreateAnnotationValidator : AbstractValidator<CreateAnnotationCommand>
{
    public CreateAnnotationValidator()
    {
        RuleFor(v => v.Type).NotEmpty().MaximumLength(50);
    }
}

public class UpdateAnnotationValidator : AbstractValidator<UpdateAnnotationCommand>
{
    public UpdateAnnotationValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
