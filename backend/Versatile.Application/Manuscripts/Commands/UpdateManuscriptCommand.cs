using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Commands;

public record UpdateManuscriptCommand(Guid Id, string? Title, string? Content, int? WordCount, Guid? OrganizationId, Guid UserId) : IRequest<ManuscriptDto>, IRequiresOrganization;
