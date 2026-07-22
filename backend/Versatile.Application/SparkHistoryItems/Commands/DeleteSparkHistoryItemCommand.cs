using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Commands;

public record DeleteSparkHistoryItemCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
