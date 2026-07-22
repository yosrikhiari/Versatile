using FluentValidation;
using Versatile.Application.GeneratedStories.Commands;

namespace Versatile.Application.GeneratedStories.Validators;

public class CreateGeneratedStoryValidator : AbstractValidator<CreateGeneratedStoryCommand>
{
    public CreateGeneratedStoryValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateGeneratedStoryValidator : AbstractValidator<UpdateGeneratedStoryCommand>
{
    public UpdateGeneratedStoryValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteGeneratedStoryValidator : AbstractValidator<DeleteGeneratedStoryCommand>
{
    public DeleteGeneratedStoryValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
