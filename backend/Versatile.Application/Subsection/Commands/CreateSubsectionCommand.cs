using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Subsection.Commands;

public record CreateSubsectionCommand(Guid StoryId, Guid SectionId, string Title, string? Summary, string? Content, string? Tags, Guid UserId) : IRequest<SubsectionDto>;
