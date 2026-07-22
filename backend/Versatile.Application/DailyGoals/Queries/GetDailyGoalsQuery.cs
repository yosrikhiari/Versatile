using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.DailyGoals.Queries;
public record GetDailyGoalsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<DailyGoalDto>>, IRequiresOrganization;
public record GetDailyGoalByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<DailyGoalDto>, IRequiresOrganization;
