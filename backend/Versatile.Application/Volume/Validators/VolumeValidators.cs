using FluentValidation;
using Versatile.Application.Volume.Commands;

namespace Versatile.Application.Volume.Validators;

public class CreateVolumeValidator : AbstractValidator<CreateVolumeCommand>
{
    public CreateVolumeValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}

public class UpdateVolumeValidator : AbstractValidator<UpdateVolumeCommand>
{
    public UpdateVolumeValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteVolumeValidator : AbstractValidator<DeleteVolumeCommand>
{
    public DeleteVolumeValidator() => RuleFor(v => v.Id).NotEmpty();
}
