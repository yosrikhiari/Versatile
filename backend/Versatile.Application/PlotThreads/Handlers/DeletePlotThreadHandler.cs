using MediatR;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Handlers;

public class DeletePlotThreadHandler : IRequestHandler<DeletePlotThreadCommand, Unit>
{
    private readonly IRepository<PlotThread> _plotThreads;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeletePlotThreadHandler(
        IRepository<PlotThread> plotThreads,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _plotThreads = plotThreads;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeletePlotThreadCommand request, CancellationToken ct)
    {
        var plotThread = await _plotThreads.GetByIdAsync(request.Id, ct);
        if (plotThread is null)
            throw new KeyNotFoundException("PlotThread not found");

        var story = await _stories.GetByIdForOrganizationAsync(plotThread.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("PlotThread not found");

        _plotThreads.Delete(plotThread);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
