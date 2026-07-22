using FluentValidation;
using Versatile.Application.StoryStateSnapshots.Commands;

namespace Versatile.Application.StoryStateSnapshots.Validators;

public class CreateStoryStateSnapshotValidator : AbstractValidator<CreateStoryStateSnapshotCommand>
{
    public CreateStoryStateSnapshotValidator() => RuleFor(v => v.StoryId).NotEmpty();
}

public class UpdateStoryStateSnapshotValidator : AbstractValidator<UpdateStoryStateSnapshotCommand>
{
    public UpdateStoryStateSnapshotValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteStoryStateSnapshotValidator : AbstractValidator<DeleteStoryStateSnapshotCommand>
{
    public DeleteStoryStateSnapshotValidator() => RuleFor(v => v.Id).NotEmpty();
}
