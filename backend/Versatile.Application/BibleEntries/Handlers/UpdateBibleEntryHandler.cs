using MediatR;
using Versatile.Application.BibleEntries.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Handlers;
public class UpdateBibleEntryHandler : IRequestHandler<UpdateBibleEntryCommand, BibleEntryDto>
{
    private readonly IRepository<BibleEntry> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public UpdateBibleEntryHandler(IRepository<BibleEntry> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<BibleEntryDto> Handle(UpdateBibleEntryCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("BibleEntry not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("BibleEntry not found");
        if (request.Title is not null) entity.Title = request.Title;
        if (request.Content is not null) entity.Content = request.Content;
        if (request.Category is not null) entity.Category = request.Category;
        entity.UpdatedAt = DateTime.UtcNow;
        _entities.Update(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static BibleEntryDto ToDto(BibleEntry e) => new(e.Id, e.StoryId, e.Title, e.Content, e.Category, e.CreatedAt, e.UpdatedAt);
}
