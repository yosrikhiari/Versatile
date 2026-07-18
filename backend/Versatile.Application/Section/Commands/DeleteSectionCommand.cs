using MediatR;

namespace Versatile.Application.Section.Commands;

public record DeleteSectionCommand(Guid Id, Guid UserId) : IRequest<Unit>;
