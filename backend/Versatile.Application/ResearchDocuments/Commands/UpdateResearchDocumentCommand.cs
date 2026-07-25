using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Commands;

public record UpdateResearchDocumentCommand(Guid Id, string? FileName, string? FileType, string? Content, string? Notes, Guid? OrganizationId, Guid UserId) : IRequest<ResearchDocumentDto>, IRequiresOrganization;
