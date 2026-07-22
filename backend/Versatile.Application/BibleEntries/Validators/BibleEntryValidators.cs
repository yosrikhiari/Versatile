using FluentValidation;
using Versatile.Application.BibleEntries.Commands;
namespace Versatile.Application.BibleEntries.Validators;
public class CreateBibleEntryValidator : AbstractValidator<CreateBibleEntryCommand>
{
    public CreateBibleEntryValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.Title).NotEmpty().MaximumLength(500);
    }
}
public class UpdateBibleEntryValidator : AbstractValidator<UpdateBibleEntryCommand>
{
    public UpdateBibleEntryValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
public class DeleteBibleEntryValidator : AbstractValidator<DeleteBibleEntryCommand>
{
    public DeleteBibleEntryValidator() { RuleFor(v => v.Id).NotEmpty(); }
}
