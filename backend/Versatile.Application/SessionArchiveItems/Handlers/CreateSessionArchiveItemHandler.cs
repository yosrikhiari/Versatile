using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SessionArchiveItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Handlers;

public class CreateSessionArchiveItemHandler : IRequestHandler<CreateSessionArchiveItemCommand, SessionArchiveItemDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<SessionArchiveItem> _items;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSessionArchiveItemHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<SessionArchiveItem> items,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _items = items;
        _unitOfWork = unitOfWork;
    }

    public async Task<SessionArchiveItemDto> Handle(CreateSessionArchiveItemCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var item = new SessionArchiveItem
        {
            StoryId = request.StoryId,
            Signal = request.Signal,
            Type = request.Type,
            Timestamp = request.Timestamp,
            Data = request.Data,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _items.AddAsync(item, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(item);
    }

    private static SessionArchiveItemDto ToDto(SessionArchiveItem i) => new(
        i.Id, i.StoryId, i.Signal, i.Type, i.Timestamp, i.Data
    );
}
