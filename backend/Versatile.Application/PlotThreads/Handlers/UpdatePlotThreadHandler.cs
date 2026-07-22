using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Handlers;

public class UpdatePlotThreadHandler : IRequestHandler<UpdatePlotThreadCommand, PlotThreadDto>
{
    private readonly IRepository<PlotThread> _plotThreads;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdatePlotThreadHandler(
        IRepository<PlotThread> plotThreads,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _plotThreads = plotThreads;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<PlotThreadDto> Handle(UpdatePlotThreadCommand request, CancellationToken ct)
    {
        var plotThread = await _plotThreads.GetByIdAsync(request.Id, ct);
        if (plotThread is null)
            throw new KeyNotFoundException("PlotThread not found");

        var story = await _stories.GetByIdForOrganizationAsync(plotThread.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("PlotThread not found");

        if (request.Title is not null) plotThread.Title = request.Title;
        if (request.Status is not null) plotThread.Status = request.Status;
        if (request.Notes is not null) plotThread.Notes = request.Notes;
        if (request.Order.HasValue) plotThread.Order = request.Order.Value;
        plotThread.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(plotThread);
    }

    private static PlotThreadDto ToDto(PlotThread p) => new(
        p.Id, p.StoryId, p.Title, p.Status, p.Notes, p.Order, p.CreatedAt, p.UpdatedAt
    );
}
