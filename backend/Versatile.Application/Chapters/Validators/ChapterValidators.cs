using FluentValidation;
using Versatile.Application.Chapters.Commands;

namespace Versatile.Application.Chapters.Validators;

public class CreateChapterValidator : AbstractValidator<CreateChapterCommand>
{
    public CreateChapterValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateChapterValidator : AbstractValidator<UpdateChapterCommand>
{
    public UpdateChapterValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteChapterValidator : AbstractValidator<DeleteChapterCommand>
{
    public DeleteChapterValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
