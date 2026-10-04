using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Section.Commands;

/// <remarks><c>VolumeId</c> / <c>BranchId</c>: null leaves the link as it is, <see cref="Guid.Empty"/> clears it.</remarks>
public record UpdateSectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Status, string? Tags, Guid? OrganizationId, Guid UserId, Guid? VolumeId = null, Guid? BranchId = null) : IRequest<SectionDto>, IRequiresOrganization;
