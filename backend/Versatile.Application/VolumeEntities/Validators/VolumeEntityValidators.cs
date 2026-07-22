using FluentValidation;
using Versatile.Application.VolumeEntities.Commands;

namespace Versatile.Application.VolumeEntities.Validators;

public class CreateVolumeEntityValidator : AbstractValidator<CreateVolumeEntityCommand>
{
    public CreateVolumeEntityValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.VolumeId).NotEmpty();
        RuleFor(v => v.EntityType).NotEmpty().MaximumLength(100);
        RuleFor(v => v.EntityId).NotEmpty();
    }
}

public class UpdateVolumeEntityValidator : AbstractValidator<UpdateVolumeEntityCommand>
{
    public UpdateVolumeEntityValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteVolumeEntityValidator : AbstractValidator<DeleteVolumeEntityCommand>
{
    public DeleteVolumeEntityValidator() => RuleFor(v => v.Id).NotEmpty();
}
