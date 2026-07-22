using FluentValidation;
using Versatile.Application.GraphGroups.Commands;

namespace Versatile.Application.GraphGroups.Validators;

public class CreateGraphGroupValidator : AbstractValidator<CreateGraphGroupCommand>
{
    public CreateGraphGroupValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Label).NotEmpty().MaximumLength(200);
        RuleFor(v => v.Color).NotEmpty().MaximumLength(50);
    }
}

public class UpdateGraphGroupValidator : AbstractValidator<UpdateGraphGroupCommand>
{
    public UpdateGraphGroupValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteGraphGroupValidator : AbstractValidator<DeleteGraphGroupCommand>
{
    public DeleteGraphGroupValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
