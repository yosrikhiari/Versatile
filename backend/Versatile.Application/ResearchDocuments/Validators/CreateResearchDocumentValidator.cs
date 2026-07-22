using FluentValidation;
using Versatile.Application.ResearchDocuments.Commands;

namespace Versatile.Application.ResearchDocuments.Validators;

public class CreateResearchDocumentValidator : AbstractValidator<CreateResearchDocumentCommand>
{
    public CreateResearchDocumentValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.FileName).NotEmpty().MaximumLength(500);
        RuleFor(v => v.FileType).NotEmpty().MaximumLength(100);
    }
}

public class UpdateResearchDocumentValidator : AbstractValidator<UpdateResearchDocumentCommand>
{
    public UpdateResearchDocumentValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
        RuleFor(v => v.FileName).MaximumLength(500).When(v => v.FileName is not null);
        RuleFor(v => v.FileType).MaximumLength(100).When(v => v.FileType is not null);
    }
}
