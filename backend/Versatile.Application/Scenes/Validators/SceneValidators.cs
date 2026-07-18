using FluentValidation;
using Versatile.Application.Scenes.Commands;

namespace Versatile.Application.Scenes.Validators;

public class CreateSceneValidator : AbstractValidator<CreateSceneCommand>
{
    public CreateSceneValidator()
    {
        RuleFor(v => v.ChapterId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateSceneValidator : AbstractValidator<UpdateSceneCommand>
{
    public UpdateSceneValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteSceneValidator : AbstractValidator<DeleteSceneCommand>
{
    public DeleteSceneValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
