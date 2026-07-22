using FluentValidation;
using Versatile.Application.VoiceProfiles.Commands;

namespace Versatile.Application.VoiceProfiles.Validators;

public class CreateVoiceProfileValidator : AbstractValidator<CreateVoiceProfileCommand>
{
    public CreateVoiceProfileValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Name).NotEmpty().MaximumLength(200);
    }
}

public class UpdateVoiceProfileValidator : AbstractValidator<UpdateVoiceProfileCommand>
{
    public UpdateVoiceProfileValidator() => RuleFor(v => v.Id).NotEmpty();
}

public class DeleteVoiceProfileValidator : AbstractValidator<DeleteVoiceProfileCommand>
{
    public DeleteVoiceProfileValidator() => RuleFor(v => v.Id).NotEmpty();
}
