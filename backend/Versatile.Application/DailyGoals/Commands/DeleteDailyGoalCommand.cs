using MediatR;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Commands;
public record DeleteDailyGoalCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
