using FluentValidation;
using Versatile.Application.DailyGoals.Commands;
namespace Versatile.Application.DailyGoals.Validators;
public class CreateDailyGoalValidator : AbstractValidator<CreateDailyGoalCommand>
{
    public CreateDailyGoalValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Date).NotEmpty();
        RuleFor(v => v.TargetWords).GreaterThan(0);
    }
}
public class UpdateDailyGoalValidator : AbstractValidator<UpdateDailyGoalCommand>
{
    public UpdateDailyGoalValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
public class DeleteDailyGoalValidator : AbstractValidator<DeleteDailyGoalCommand>
{
    public DeleteDailyGoalValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
