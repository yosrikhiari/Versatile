using FluentValidation;
using Versatile.Application.Stories.Commands;

namespace Versatile.Application.Stories.Validators;

public class DeleteStoryValidator : AbstractValidator<DeleteStoryCommand>
{
    public DeleteStoryValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
