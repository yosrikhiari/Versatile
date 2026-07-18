using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class PlotThreadService : IPlotThreadService
{
    private readonly ApplicationDbContext _db;
    public PlotThreadService(ApplicationDbContext db) => _db = db;

    public async Task<List<PlotThreadDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.PlotThreads.Where(p => p.StoryId == storyId).OrderBy(p => p.Order).Select(p => ToDto(p)).ToListAsync();
    }

    public async Task<PlotThreadDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var plotThread = await _db.PlotThreads.Include(p => p.Story).FirstOrDefaultAsync(p => p.Id == id && p.Story!.UserId == userId && (!organizationId.HasValue || p.Story!.OrganizationId == organizationId.Value));
        return plotThread is null ? throw new KeyNotFoundException("PlotThread not found") : ToDto(plotThread);
    }

    public async Task<PlotThreadDto> CreateAsync(Guid storyId, CreatePlotThreadRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var maxOrder = await _db.PlotThreads.Where(p => p.StoryId == storyId).MaxAsync(p => (int?)p.Order) ?? 0;
        var plotThread = new PlotThread { StoryId = storyId, Title = request.Title, Status = request.Status ?? "Draft", Notes = request.Notes, Order = maxOrder + 1 };
        _db.PlotThreads.Add(plotThread);
        await _db.SaveChangesAsync();
        return ToDto(plotThread);
    }

    public async Task<PlotThreadDto> UpdateAsync(Guid id, UpdatePlotThreadRequest request, Guid userId, Guid? organizationId = null)
    {
        var plotThread = await _db.PlotThreads.Include(p => p.Story).FirstOrDefaultAsync(p => p.Id == id && p.Story!.UserId == userId && (!organizationId.HasValue || p.Story!.OrganizationId == organizationId.Value));
        if (plotThread is null) throw new KeyNotFoundException("PlotThread not found");
        if (request.Title is not null) plotThread.Title = request.Title;
        if (request.Status is not null) plotThread.Status = request.Status;
        if (request.Notes is not null) plotThread.Notes = request.Notes;
        if (request.Order.HasValue) plotThread.Order = request.Order.Value;
        plotThread.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(plotThread);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var plotThread = await _db.PlotThreads.Include(p => p.Story).FirstOrDefaultAsync(p => p.Id == id && p.Story!.UserId == userId && (!organizationId.HasValue || p.Story!.OrganizationId == organizationId.Value));
        if (plotThread is null) throw new KeyNotFoundException("PlotThread not found");
        _db.PlotThreads.Remove(plotThread);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static PlotThreadDto ToDto(PlotThread p) => new(p.Id, p.StoryId, p.Title, p.Status, p.Notes, p.Order, p.CreatedAt, p.UpdatedAt);
}
