using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Commands;
using Entity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class UpdateSubsectionHandler : IRequestHandler<UpdateSubsectionCommand, SubsectionDto>
{
    private readonly DbContext _db;
    public UpdateSubsectionHandler(DbContext db) => _db = db;

    public async Task<SubsectionDto> Handle(UpdateSubsectionCommand request, CancellationToken ct)
    {
        var subsection = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId && (request.OrganizationId == null || s.Story!.OrganizationId == request.OrganizationId), ct)
            ?? throw new KeyNotFoundException("Subsection not found");

        if (request.Title is not null) subsection.Title = request.Title;
        if (request.Summary is not null) subsection.Summary = request.Summary;
        if (request.Content is not null) subsection.Content = request.Content;
        if (request.Order.HasValue) subsection.Order = request.Order.Value;
        if (request.Tags is not null) subsection.Tags = request.Tags;
        subsection.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return ToDto(subsection);
    }

    private static SubsectionDto ToDto(Entity s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
