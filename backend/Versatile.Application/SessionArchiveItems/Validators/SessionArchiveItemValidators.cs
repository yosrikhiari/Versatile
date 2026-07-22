using FluentValidation;
using Versatile.Application.SessionArchiveItems.Commands;

namespace Versatile.Application.SessionArchiveItems.Validators;

public class CreateSessionArchiveItemValidator : AbstractValidator<CreateSessionArchiveItemCommand>
{
    public CreateSessionArchiveItemValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Signal).NotEmpty().MaximumLength(100);
        RuleFor(v => v.Type).NotEmpty().MaximumLength(100);
    }
}

public class UpdateSessionArchiveItemValidator : AbstractValidator<UpdateSessionArchiveItemCommand>
{
    public UpdateSessionArchiveItemValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteSessionArchiveItemValidator : AbstractValidator<DeleteSessionArchiveItemCommand>
{
    public DeleteSessionArchiveItemValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
