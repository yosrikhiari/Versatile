using FluentValidation;
using Versatile.Application.SparkHistoryItems.Commands;

namespace Versatile.Application.SparkHistoryItems.Validators;

public class CreateSparkHistoryItemValidator : AbstractValidator<CreateSparkHistoryItemCommand>
{
    public CreateSparkHistoryItemValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Type).NotEmpty().MaximumLength(100);
    }
}

public class UpdateSparkHistoryItemValidator : AbstractValidator<UpdateSparkHistoryItemCommand>
{
    public UpdateSparkHistoryItemValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteSparkHistoryItemValidator : AbstractValidator<DeleteSparkHistoryItemCommand>
{
    public DeleteSparkHistoryItemValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
