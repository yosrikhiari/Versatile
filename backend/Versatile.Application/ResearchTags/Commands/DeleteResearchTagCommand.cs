using MediatR;

namespace Versatile.Application.ResearchTags.Commands;

public record DeleteResearchTagCommand(Guid Id, Guid UserId) : IRequest<Unit>;
