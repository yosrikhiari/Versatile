using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Subsection.Commands;

/// <remarks><c>SectionId</c> moves the scene to another chapter of the same story; <c>BranchId</c>: null leaves it, <see cref="Guid.Empty"/> clears it.</remarks>
public record UpdateSubsectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Tags, Guid? OrganizationId, Guid UserId, Guid? SectionId = null, Guid? BranchId = null) : IRequest<SubsectionDto>, IRequiresOrganization;
