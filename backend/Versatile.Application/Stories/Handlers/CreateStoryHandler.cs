using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Events;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class CreateStoryHandler : IRequestHandler<CreateStoryCommand, StoryDto>
{
    private readonly IRepository<Story> _repo;
    private readonly IUnitOfWork _uow;

    public CreateStoryHandler(IRepository<Story> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<StoryDto> Handle(CreateStoryCommand request, CancellationToken ct)
    {
        var story = new Story
        {
            Title = request.Title,
            Premise = request.Premise,
            Genre = request.Genre,
            Tone = request.Tone,
            WritingStyle = request.WritingStyle,
            TargetAudience = request.TargetAudience,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _repo.AddAsync(story, ct);
        _uow.AddDomainEvent(new StoryCreatedEvent(story.Id, story.Title, story.UserId));
        await _uow.SaveChangesAsync(ct);

        return new StoryDto(story.Id, story.Title, story.Premise, story.Genre, story.Tone, story.WritingStyle, story.TargetAudience, story.CreatedAt, story.UpdatedAt);
    }
}
