using MediatR;

namespace Versatile.Application.Subsection.Commands;

public record DeleteSubsectionCommand(Guid Id, Guid UserId) : IRequest<Unit>;
