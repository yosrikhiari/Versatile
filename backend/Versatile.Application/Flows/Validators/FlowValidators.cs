using FluentValidation;
using Versatile.Application.Flows.Commands;

namespace Versatile.Application.Flows.Validators;

public class UpdateFlowValidator : AbstractValidator<UpdateFlowCommand>
{
    public UpdateFlowValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
    }
}
