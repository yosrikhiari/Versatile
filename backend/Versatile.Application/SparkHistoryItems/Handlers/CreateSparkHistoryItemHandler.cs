using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SparkHistoryItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Handlers;

public class CreateSparkHistoryItemHandler : IRequestHandler<CreateSparkHistoryItemCommand, SparkHistoryItemDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<SparkHistoryItem> _items;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSparkHistoryItemHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<SparkHistoryItem> items,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _items = items;
        _unitOfWork = unitOfWork;
    }

    public async Task<SparkHistoryItemDto> Handle(CreateSparkHistoryItemCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var item = new SparkHistoryItem
        {
            StoryId = request.StoryId,
            Type = request.Type,
            Prompt = request.Prompt,
            Blueprint = request.Blueprint,
            GeneratedContent = request.GeneratedContent,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _items.AddAsync(item, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(item);
    }

    private static SparkHistoryItemDto ToDto(SparkHistoryItem i) => new(
        i.Id, i.StoryId, i.Type, i.Prompt, i.Blueprint, i.GeneratedContent, i.CreatedAt
    );
}
