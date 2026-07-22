using FluentValidation;
using Versatile.Application.Snapshots.Commands;

namespace Versatile.Application.Snapshots.Validators;

public class CreateSnapshotValidator : AbstractValidator<CreateSnapshotCommand>
{
    public CreateSnapshotValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
    }
}

public class UpdateSnapshotValidator : AbstractValidator<UpdateSnapshotCommand>
{
    public UpdateSnapshotValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteSnapshotValidator : AbstractValidator<DeleteSnapshotCommand>
{
    public DeleteSnapshotValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
