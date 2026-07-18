using MediatR;

namespace Versatile.Application.Chapters.Commands;

public record DeleteChapterCommand(Guid Id, Guid UserId) : IRequest<Unit>;
