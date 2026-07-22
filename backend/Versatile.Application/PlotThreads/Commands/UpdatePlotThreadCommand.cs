using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Commands;

public record UpdatePlotThreadCommand(Guid Id, string? Title, string? Status, string? Notes, int? Order, Guid? OrganizationId, Guid UserId) : IRequest<PlotThreadDto>, IRequiresOrganization;
