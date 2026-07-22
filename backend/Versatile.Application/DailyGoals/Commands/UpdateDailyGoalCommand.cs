using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Commands;
public record UpdateDailyGoalCommand(Guid Id, DateTime? Date, int? TargetWords, int? CurrentWords, bool? Completed, Guid? OrganizationId, Guid UserId) : IRequest<DailyGoalDto>, IRequiresOrganization;
