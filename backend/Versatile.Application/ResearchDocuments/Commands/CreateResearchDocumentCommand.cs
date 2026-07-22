using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchDocuments.Commands;

public record CreateResearchDocumentCommand(Guid StoryId, string FileName, string FileType, string? Content, string? Notes, Guid UserId) : IRequest<ResearchDocumentDto>;
