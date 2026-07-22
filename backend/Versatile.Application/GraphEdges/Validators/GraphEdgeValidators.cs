using FluentValidation;
using Versatile.Application.GraphEdges.Commands;

namespace Versatile.Application.GraphEdges.Validators;

public class CreateGraphEdgeValidator : AbstractValidator<CreateGraphEdgeCommand>
{
    public CreateGraphEdgeValidator()
    {
        RuleFor(v => v.StoryId).NotEmpty();
        RuleFor(v => v.SourceId).NotEmpty().MaximumLength(100);
        RuleFor(v => v.TargetId).NotEmpty().MaximumLength(100);
        RuleFor(v => v.SourceType).NotEmpty().MaximumLength(50);
        RuleFor(v => v.TargetType).NotEmpty().MaximumLength(50);
        RuleFor(v => v.RelationshipType).NotEmpty().MaximumLength(50);
    }
}

public class UpdateGraphEdgeValidator : AbstractValidator<UpdateGraphEdgeCommand>
{
    public UpdateGraphEdgeValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}

public class DeleteGraphEdgeValidator : AbstractValidator<DeleteGraphEdgeCommand>
{
    public DeleteGraphEdgeValidator()
    {
        RuleFor(v => v.Id).NotEmpty();
    }
}
