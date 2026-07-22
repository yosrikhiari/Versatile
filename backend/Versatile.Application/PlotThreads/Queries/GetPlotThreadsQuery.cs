using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Queries;

public record GetPlotThreadsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<PlotThreadDto>>, IRequiresOrganization;

public record GetPlotThreadByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<PlotThreadDto>, IRequiresOrganization;
