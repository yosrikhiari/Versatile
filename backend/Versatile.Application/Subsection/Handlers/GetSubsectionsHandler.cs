using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Queries;
using Entity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class GetSubsectionsHandler : IRequestHandler<GetSubsectionsQuery, List<SubsectionDto>>
{
    private readonly DbContext _db;
    public GetSubsectionsHandler(DbContext db) => _db = db;

    public async Task<List<SubsectionDto>> Handle(GetSubsectionsQuery request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && (request.OrganizationId == null || s.OrganizationId == request.OrganizationId), ct))
            throw new KeyNotFoundException("Story not found");

        return await _db.Set<Entity>()
            .Where(s => s.StoryId == request.StoryId)
            .OrderBy(s => s.Order)
            .Select(s => new SubsectionDto(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt))
            .ToListAsync(ct);
    }
}

public class GetSubsectionByIdHandler : IRequestHandler<GetSubsectionByIdQuery, SubsectionDto>
{
    private readonly DbContext _db;
    public GetSubsectionByIdHandler(DbContext db) => _db = db;

    public async Task<SubsectionDto> Handle(GetSubsectionByIdQuery request, CancellationToken ct)
    {
        var subsection = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId && (request.OrganizationId == null || s.Story!.OrganizationId == request.OrganizationId), ct)
            ?? throw new KeyNotFoundException("Subsection not found");
        return new SubsectionDto(subsection.Id, subsection.StoryId, subsection.SectionId, subsection.Title, subsection.Summary, subsection.Content, subsection.Order, subsection.Tags, subsection.CreatedAt, subsection.UpdatedAt);
    }
}
