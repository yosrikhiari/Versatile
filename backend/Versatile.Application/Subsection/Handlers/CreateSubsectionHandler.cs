using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Commands;
using Entity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class CreateSubsectionHandler : IRequestHandler<CreateSubsectionCommand, SubsectionDto>
{
    private readonly DbContext _db;
    public CreateSubsectionHandler(DbContext db) => _db = db;

    public async Task<SubsectionDto> Handle(CreateSubsectionCommand request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId, ct))
            throw new KeyNotFoundException("Story not found");

        var maxOrder = await _db.Set<Entity>()
            .Where(s => s.StoryId == request.StoryId)
            .MaxAsync(s => (int?)s.Order, ct) ?? 0;

        var subsection = new Entity
        {
            StoryId = request.StoryId,
            SectionId = request.SectionId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Tags = request.Tags
        };
        _db.Set<Entity>().Add(subsection);
        await _db.SaveChangesAsync(ct);
        return ToDto(subsection);
    }

    private static SubsectionDto ToDto(Entity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
