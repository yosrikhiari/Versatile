using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Commands;
public record CreateDailyGoalCommand(Guid StoryId, DateTime Date, int TargetWords, Guid? OrganizationId, Guid UserId) : IRequest<DailyGoalDto>, IRequiresOrganization;
