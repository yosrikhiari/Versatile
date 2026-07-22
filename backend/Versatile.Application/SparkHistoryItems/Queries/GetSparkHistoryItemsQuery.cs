using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Queries;

public record GetSparkHistoryItemsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SparkHistoryItemDto>>, IRequiresOrganization;

public record GetSparkHistoryItemByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SparkHistoryItemDto>, IRequiresOrganization;
