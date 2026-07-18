using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Section.Commands;

public record CreateSectionCommand(Guid StoryId, string Title, string? Summary, string? Content, string? Status, string? Tags, Guid UserId) : IRequest<SectionDto>;
