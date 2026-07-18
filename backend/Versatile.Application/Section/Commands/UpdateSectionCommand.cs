using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Section.Commands;

public record UpdateSectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Status, string? Tags, Guid? OrganizationId, Guid UserId) : IRequest<SectionDto>, IRequiresOrganization;
