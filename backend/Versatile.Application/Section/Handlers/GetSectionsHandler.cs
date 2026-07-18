using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Queries;
using Entity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class GetSectionsHandler : IRequestHandler<GetSectionsQuery, List<SectionDto>>
{
    private readonly DbContext _db;
    public GetSectionsHandler(DbContext db) => _db = db;

    public async Task<List<SectionDto>> Handle(GetSectionsQuery request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId, ct))
            throw new KeyNotFoundException("Story not found");

        return await _db.Set<Entity>()
            .Where(s => s.StoryId == request.StoryId)
            .OrderBy(s => s.Order)
            .Select(s => new SectionDto(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt))
            .ToListAsync(ct);
    }
}

public class GetSectionByIdHandler : IRequestHandler<GetSectionByIdQuery, SectionDto>
{
    private readonly DbContext _db;
    public GetSectionByIdHandler(DbContext db) => _db = db;

    public async Task<SectionDto> Handle(GetSectionByIdQuery request, CancellationToken ct)
    {
        var section = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Section not found");
        return new SectionDto(section.Id, section.StoryId, section.VolumeId, section.Title, section.Summary, section.Content, section.Order, section.Status, section.Tags, section.CreatedAt, section.UpdatedAt);
    }
}
