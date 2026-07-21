using FluentValidation;
using Versatile.Application.RevisionComments.Commands;

namespace Versatile.Application.RevisionComments.Validators;

public class CreateRevisionCommentValidator : AbstractValidator<CreateRevisionCommentCommand>
{
    public CreateRevisionCommentValidator()
    {
        RuleFor(v => v.ParagraphIndex).GreaterThanOrEqualTo(0);
    }
}

public class UpdateRevisionCommentValidator : AbstractValidator<UpdateRevisionCommentCommand>
{
    public UpdateRevisionCommentValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
