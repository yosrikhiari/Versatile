using FluentValidation;
using Versatile.Application.ResearchChunks.Commands;

namespace Versatile.Application.ResearchChunks.Validators;

public class CreateResearchChunkValidator : AbstractValidator<CreateResearchChunkCommand>
{
    public CreateResearchChunkValidator()
    {
        RuleFor(v => v.DocumentId).NotEmpty();
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Content).NotEmpty();
    }
}

public class UpdateResearchChunkValidator : AbstractValidator<UpdateResearchChunkCommand>
{
    public UpdateResearchChunkValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
