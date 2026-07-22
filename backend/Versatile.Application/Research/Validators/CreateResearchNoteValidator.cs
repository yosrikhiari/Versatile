using FluentValidation;
using Versatile.Application.Research.Commands;

namespace Versatile.Application.Research.Validators;

public class CreateResearchNoteValidator : AbstractValidator<CreateResearchNoteCommand>
{
    public CreateResearchNoteValidator()
    {
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateResearchNoteValidator : AbstractValidator<UpdateResearchNoteCommand>
{
    public UpdateResearchNoteValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
