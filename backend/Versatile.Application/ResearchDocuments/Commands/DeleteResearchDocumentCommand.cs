using MediatR;

namespace Versatile.Application.ResearchDocuments.Commands;

public record DeleteResearchDocumentCommand(Guid Id, Guid UserId) : IRequest<Unit>;
