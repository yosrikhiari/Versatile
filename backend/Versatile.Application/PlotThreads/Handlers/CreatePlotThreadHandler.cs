using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.PlotThreads.Handlers;

public class CreatePlotThreadHandler : IRequestHandler<CreatePlotThreadCommand, PlotThreadDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<PlotThread> _plotThreads;
    private readonly IUnitOfWork _unitOfWork;

    public CreatePlotThreadHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<PlotThread> plotThreads,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _plotThreads = plotThreads;
        _unitOfWork = unitOfWork;
    }

    public async Task<PlotThreadDto> Handle(CreatePlotThreadCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var plotThread = new PlotThread
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Status = request.Status,
            Notes = request.Notes,
            Order = request.Order,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _plotThreads.AddAsync(plotThread, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(plotThread);
    }

    private static PlotThreadDto ToDto(PlotThread p) => new(
        p.Id, p.StoryId, p.Title, p.Status, p.Notes, p.Order, p.CreatedAt, p.UpdatedAt
    );
}
