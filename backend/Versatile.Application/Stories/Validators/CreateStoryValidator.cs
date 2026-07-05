using FluentValidation;
using Versatile.Application.Stories.Commands;

namespace Versatile.Application.Stories.Validators;

public class CreateStoryValidator : AbstractValidator<CreateStoryCommand>
{
    public CreateStoryValidator()
    {
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateStoryValidator : AbstractValidator<UpdateStoryCommand>
{
    public UpdateStoryValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
