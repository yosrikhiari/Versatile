using Microsoft.EntityFrameworkCore;
using Versatile.Application.Services;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Services;

public sealed class StoryAccessChecker : IStoryAccessChecker
{
    private readonly ApplicationDbContext _db;

    public StoryAccessChecker(ApplicationDbContext db)
    {
        _db = db;
    }

    public Task<bool> CanAccessAsync(Guid storyId, Guid userId, Guid? organizationId, CancellationToken cancellationToken = default) =>
        _db.Stories.AnyAsync(
            s => s.Id == storyId
                && s.UserId == userId
                && (!organizationId.HasValue || s.OrganizationId == organizationId.Value),
            cancellationToken);
}
