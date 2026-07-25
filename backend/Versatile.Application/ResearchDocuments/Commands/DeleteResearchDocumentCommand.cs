using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Commands;

public record DeleteResearchDocumentCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
