using FluentValidation;
using Versatile.Application.ResearchTags.Commands;

namespace Versatile.Application.ResearchTags.Validators;

public class CreateResearchTagValidator : AbstractValidator<CreateResearchTagCommand>
{
    public CreateResearchTagValidator()
    {
        RuleFor(v => v.Name).NotEmpty().MaximumLength(100);
    }
}

public class UpdateResearchTagValidator : AbstractValidator<UpdateResearchTagCommand>
{
    public UpdateResearchTagValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
        RuleFor(v => v.Name).MaximumLength(100).When(v => v.Name is not null);
    }
}
