using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Commands;

/// <remarks><c>SourceBranchId</c>: null leaves it, <see cref="Guid.Empty"/> clears it.</remarks>
public record UpdateBranchCommand(Guid Id, string? Name, Guid? SourceBranchId, string? Description, string? Status, Guid? OrganizationId, Guid UserId) : IRequest<BranchDto>, IRequiresOrganization;
