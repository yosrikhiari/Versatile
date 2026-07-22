using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SessionArchiveItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Handlers;

public class UpdateSessionArchiveItemHandler : IRequestHandler<UpdateSessionArchiveItemCommand, SessionArchiveItemDto>
{
    private readonly IRepository<SessionArchiveItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSessionArchiveItemHandler(
        IRepository<SessionArchiveItem> items,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _items = items;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<SessionArchiveItemDto> Handle(UpdateSessionArchiveItemCommand request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Session archive item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Session archive item not found");

        if (request.Signal is not null) item.Signal = request.Signal;
        if (request.Type is not null) item.Type = request.Type;
        if (request.Timestamp.HasValue) item.Timestamp = request.Timestamp.Value;
        if (request.Data is not null) item.Data = request.Data;
        item.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(item);
    }

    private static SessionArchiveItemDto ToDto(SessionArchiveItem i) => new(
        i.Id, i.StoryId, i.Signal, i.Type, i.Timestamp, i.Data
    );
}
