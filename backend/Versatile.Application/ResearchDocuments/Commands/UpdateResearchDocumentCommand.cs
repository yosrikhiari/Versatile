using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchDocuments.Commands;

public record UpdateResearchDocumentCommand(Guid Id, string? FileName, string? FileType, string? Content, string? Notes, Guid UserId) : IRequest<ResearchDocumentDto>;
