using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Entity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class UpdateSectionHandler : IRequestHandler<UpdateSectionCommand, SectionDto>
{
    private readonly DbContext _db;
    public UpdateSectionHandler(DbContext db) => _db = db;

    public async Task<SectionDto> Handle(UpdateSectionCommand request, CancellationToken ct)
    {
        var section = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Section not found");

        if (request.Title is not null) section.Title = request.Title;
        if (request.Summary is not null) section.Summary = request.Summary;
        if (request.Content is not null) section.Content = request.Content;
        if (request.Order.HasValue) section.Order = request.Order.Value;
        if (request.Status is not null) section.Status = request.Status;
        if (request.Tags is not null) section.Tags = request.Tags;
        section.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return ToDto(section);
    }

    private static SectionDto ToDto(Entity s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
