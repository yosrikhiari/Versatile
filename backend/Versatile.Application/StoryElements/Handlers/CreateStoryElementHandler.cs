using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryElements.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Handlers;

public class CreateStoryElementHandler : IRequestHandler<CreateStoryElementCommand, StoryElementDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<StoryElement> _elements;
    private readonly IUnitOfWork _unitOfWork;

    public CreateStoryElementHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<StoryElement> elements,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _elements = elements;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryElementDto> Handle(CreateStoryElementCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var element = new StoryElement
        {
            StoryId = request.StoryId,
            Type = request.Type,
            Title = request.Title,
            X = request.X,
            Y = request.Y,
            Width = request.Width,
            Height = request.Height,
            Data = request.Data,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _elements.AddAsync(element, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(element);
    }

    private static StoryElementDto ToDto(StoryElement e) => new(
        e.Id, e.StoryId, e.Type, e.Title, e.X, e.Y, e.Width, e.Height, e.Data
    );
}
