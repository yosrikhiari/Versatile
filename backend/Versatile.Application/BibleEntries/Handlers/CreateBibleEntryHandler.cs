using MediatR;
using Versatile.Application.BibleEntries.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Handlers;
public class CreateBibleEntryHandler : IRequestHandler<CreateBibleEntryCommand, BibleEntryDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<BibleEntry> _entities;
    private readonly IUnitOfWork _unitOfWork;
    public CreateBibleEntryHandler(IOrganizationOwnedRepository<Story> stories, IRepository<BibleEntry> entities, IUnitOfWork unitOfWork)
    { _stories = stories; _entities = entities; _unitOfWork = unitOfWork; }
    public async Task<BibleEntryDto> Handle(CreateBibleEntryCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var entity = new BibleEntry { StoryId = request.StoryId, Title = request.Title, Content = request.Content, Category = request.Category, UserId = request.UserId, OrganizationId = request.OrganizationId };
        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static BibleEntryDto ToDto(BibleEntry e) => new(e.Id, e.StoryId, e.Title, e.Content, e.Category, e.CreatedAt, e.UpdatedAt);
}
