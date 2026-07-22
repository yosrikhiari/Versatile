using FluentValidation;
using Versatile.Application.GroupEdges.Commands;

namespace Versatile.Application.GroupEdges.Validators;

public class CreateGroupEdgeValidator : AbstractValidator<CreateGroupEdgeCommand>
{
    public CreateGroupEdgeValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.SourceGroupId).NotEmpty().MaximumLength(100);
        RuleFor(v => v.TargetGroupId).NotEmpty().MaximumLength(100);
        RuleFor(v => v.RelationshipType).NotEmpty().MaximumLength(50);
    }
}

public class UpdateGroupEdgeValidator : AbstractValidator<UpdateGroupEdgeCommand>
{
    public UpdateGroupEdgeValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteGroupEdgeValidator : AbstractValidator<DeleteGroupEdgeCommand>
{
    public DeleteGroupEdgeValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
