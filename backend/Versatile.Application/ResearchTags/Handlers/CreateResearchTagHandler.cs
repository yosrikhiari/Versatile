using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Handlers;

public class CreateResearchTagHandler : IRequestHandler<CreateResearchTagCommand, ResearchTagDto>
{
    private readonly IRepository<ResearchTag> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateResearchTagHandler(IRepository<ResearchTag> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<ResearchTagDto> Handle(CreateResearchTagCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var tag = new ResearchTag
        {
            Name = request.Name,
            StoryId = request.StoryId,
            Color = request.Color,
            UserId = request.UserId
        };
        await _repo.AddAsync(tag, ct);
        await _uow.SaveChangesAsync(ct);
        return new ResearchTagDto(tag.Id, tag.StoryId, tag.Name, tag.Color!);
    }
}
