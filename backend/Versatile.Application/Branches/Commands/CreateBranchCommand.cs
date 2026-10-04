using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Commands;

public record CreateBranchCommand(Guid StoryId, string Name, Guid? SourceBranchId, string? Description, string? Status, Guid? OrganizationId, Guid UserId) : IRequest<BranchDto>, IRequiresOrganization;
