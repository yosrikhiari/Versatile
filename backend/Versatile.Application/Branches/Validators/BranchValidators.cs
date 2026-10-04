using FluentValidation;
using Versatile.Application.Branches.Commands;

namespace Versatile.Application.Branches.Validators;

public class CreateBranchValidator : AbstractValidator<CreateBranchCommand>
{
    public CreateBranchValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Name).NotEmpty().MaximumLength(200);
        RuleFor(v => v.Status).MaximumLength(50).When(v => v.Status is not null);
    }
}

public class UpdateBranchValidator : AbstractValidator<UpdateBranchCommand>
{
    public UpdateBranchValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
        RuleFor(v => v.Name).NotEmpty().MaximumLength(200).When(v => v.Name is not null);
        RuleFor(v => v.Status).MaximumLength(50).When(v => v.Status is not null);
    }
}
