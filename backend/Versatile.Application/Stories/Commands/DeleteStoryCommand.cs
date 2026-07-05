using MediatR;

namespace Versatile.Application.Stories.Commands;

public record DeleteStoryCommand(Guid Id, Guid UserId) : IRequest<Unit>;
