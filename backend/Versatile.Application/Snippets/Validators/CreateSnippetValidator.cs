using FluentValidation;
using Versatile.Application.Snippets.Commands;

namespace Versatile.Application.Snippets.Validators;

public class CreateSnippetValidator : AbstractValidator<CreateSnippetCommand>
{
    public CreateSnippetValidator()
    {
        RuleFor(v => v.Word).NotEmpty().MaximumLength(200);
    }
}

public class UpdateSnippetValidator : AbstractValidator<UpdateSnippetCommand>
{
    public UpdateSnippetValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
