using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryElements.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Handlers;

public class UpdateStoryElementHandler : IRequestHandler<UpdateStoryElementCommand, StoryElementDto>
{
    private readonly IRepository<StoryElement> _elements;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateStoryElementHandler(
        IRepository<StoryElement> elements,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _elements = elements;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryElementDto> Handle(UpdateStoryElementCommand request, CancellationToken ct)
    {
        var element = await _elements.GetByIdAsync(request.Id, ct);
        if (element is null)
            throw new KeyNotFoundException("StoryElement not found");

        var story = await _stories.GetByIdForOrganizationAsync(element.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryElement not found");

        if (request.Type is not null) element.Type = request.Type;
        if (request.Title is not null) element.Title = request.Title;
        if (request.X.HasValue) element.X = request.X.Value;
        if (request.Y.HasValue) element.Y = request.Y.Value;
        if (request.Width.HasValue) element.Width = request.Width.Value;
        if (request.Height.HasValue) element.Height = request.Height.Value;
        if (request.Data is not null) element.Data = request.Data;
        element.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(element);
    }

    private static StoryElementDto ToDto(StoryElement e) => new(
        e.Id, e.StoryId, e.Type, e.Title, e.X, e.Y, e.Width, e.Height, e.Data
    );
}
