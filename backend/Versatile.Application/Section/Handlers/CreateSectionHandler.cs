using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Entity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class CreateSectionHandler : IRequestHandler<CreateSectionCommand, SectionDto>
{
    private readonly DbContext _db;
    public CreateSectionHandler(DbContext db) => _db = db;

    public async Task<SectionDto> Handle(CreateSectionCommand request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct))
            throw new KeyNotFoundException("Story not found");

        var maxOrder = await _db.Set<Entity>()
            .Where(s => s.StoryId == request.StoryId)
            .MaxAsync(s => (int?)s.Order, ct) ?? 0;

        var section = new Entity
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Status = request.Status ?? "Draft",
            Tags = request.Tags
        };
        _db.Set<Entity>().Add(section);
        await _db.SaveChangesAsync(ct);
        return ToDto(section);
    }

    private static SectionDto ToDto(Entity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
