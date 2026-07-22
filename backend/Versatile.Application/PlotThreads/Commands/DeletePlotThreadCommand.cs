using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Commands;

public record DeletePlotThreadCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
