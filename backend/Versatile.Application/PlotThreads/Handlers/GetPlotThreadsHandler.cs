using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.PlotThreads.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Handlers;

public class GetPlotThreadsHandler : IRequestHandler<GetPlotThreadsQuery, List<PlotThreadDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<PlotThread> _plotThreads;

    public GetPlotThreadsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<PlotThread> plotThreads)
    {
        _stories = stories;
        _plotThreads = plotThreads;
    }

    public async Task<List<PlotThreadDto>> Handle(GetPlotThreadsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var plotThreads = await _plotThreads.GetAllAsync(p => p.StoryId == request.StoryId, ct);
        return plotThreads.Select(ToDto).ToList();
    }

    private static PlotThreadDto ToDto(PlotThread p) => new(
        p.Id, p.StoryId, p.Title, p.Status, p.Notes, p.Order, p.CreatedAt, p.UpdatedAt
    );
}

public class GetPlotThreadByIdHandler : IRequestHandler<GetPlotThreadByIdQuery, PlotThreadDto>
{
    private readonly IRepository<PlotThread> _plotThreads;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetPlotThreadByIdHandler(
        IRepository<PlotThread> plotThreads,
        IOrganizationOwnedRepository<Story> stories)
    {
        _plotThreads = plotThreads;
        _stories = stories;
    }

    public async Task<PlotThreadDto> Handle(GetPlotThreadByIdQuery request, CancellationToken ct)
    {
        var plotThread = await _plotThreads.GetByIdAsync(request.Id, ct);
        if (plotThread is null)
            throw new KeyNotFoundException("PlotThread not found");

        var story = await _stories.GetByIdForOrganizationAsync(plotThread.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("PlotThread not found");

        return ToDto(plotThread);
    }

    private static PlotThreadDto ToDto(PlotThread p) => new(
        p.Id, p.StoryId, p.Title, p.Status, p.Notes, p.Order, p.CreatedAt, p.UpdatedAt
    );
}
