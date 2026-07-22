using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class UpdateStoryHandler : IRequestHandler<UpdateStoryCommand, StoryDto>
{
    private readonly IOrganizationOwnedRepository<Story> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateStoryHandler(IOrganizationOwnedRepository<Story> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<StoryDto> Handle(UpdateStoryCommand request, CancellationToken ct)
    {
        var story = request.OrganizationId.HasValue
            ? await _repo.GetByIdForOrganizationAsync(request.Id, request.OrganizationId.Value, ct)
            : await _repo.GetByIdForUserAsync(request.Id, request.UserId, ct);

        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");

        if (request.Title is not null) story.Title = request.Title;
        if (request.Premise is not null) story.Premise = request.Premise;
        if (request.Genre is not null) story.Genre = request.Genre;
        if (request.Tone is not null) story.Tone = request.Tone;
        if (request.WritingStyle is not null) story.WritingStyle = request.WritingStyle;
        if (request.TargetAudience is not null) story.TargetAudience = request.TargetAudience;
        story.UpdatedAt = DateTime.UtcNow;

        _repo.Update(story);
        await _uow.SaveChangesAsync(ct);

        return new StoryDto(story.Id, story.Title, story.Premise, story.Genre, story.Tone, story.WritingStyle, story.TargetAudience, story.CreatedAt, story.UpdatedAt);
    }
}
