using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

public sealed class AuditSaveChangesInterceptor : SaveChangesInterceptor
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IOrganizationContext _orgContext;

    public AuditSaveChangesInterceptor(IHttpContextAccessor httpContextAccessor, IOrganizationContext orgContext)
    {
        _httpContextAccessor = httpContextAccessor;
        _orgContext = orgContext;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context;
        if (context is null)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        var userId = GetUserId();
        var timestamp = DateTime.UtcNow;
        var auditEntries = new List<Data.AuditEntry>();

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.Entity is AuditEntry || entry.Entity is OutboxMessage)
                continue;

            if (entry.State is EntityState.Detached or EntityState.Unchanged)
                continue;

            var entityType = entry.Entity.GetType().Name;
            var entityId = GetPrimaryKeyValue(entry) ?? "unknown";
            var action = entry.State switch
            {
                EntityState.Added => "Created",
                EntityState.Modified => "Updated",
                EntityState.Deleted => "Deleted",
                _ => entry.State.ToString()
            };

            string? previousValues = null;
            string? newValues = null;

            if (entry.State is EntityState.Modified)
            {
                var previous = new Dictionary<string, object?>();
                var current = new Dictionary<string, object?>();

                foreach (var prop in entry.Properties)
                {
                    if (prop.IsModified)
                    {
                        previous[prop.Metadata.Name] = prop.OriginalValue;
                        current[prop.Metadata.Name] = prop.CurrentValue;
                    }
                }

                if (previous.Count > 0)
                {
                    previousValues = JsonSerializer.Serialize(previous);
                    newValues = JsonSerializer.Serialize(current);
                }
            }
            else if (entry.State is EntityState.Added)
            {
                var current = new Dictionary<string, object?>();
                foreach (var prop in entry.Properties)
                    current[prop.Metadata.Name] = prop.CurrentValue;

                newValues = JsonSerializer.Serialize(current);
            }
            else if (entry.State is EntityState.Deleted)
            {
                var previous = new Dictionary<string, object?>();
                foreach (var prop in entry.Properties)
                    previous[prop.Metadata.Name] = prop.OriginalValue;

                previousValues = JsonSerializer.Serialize(previous);
            }

            auditEntries.Add(new Data.AuditEntry
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                PreviousValues = previousValues,
                NewValues = newValues,
                CreatedAt = timestamp,
                OrganizationId = _orgContext.OrganizationId
            });
        }

        if (auditEntries.Count > 0)
            context.Set<Data.AuditEntry>().AddRange(auditEntries);

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private Guid? GetUserId()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        var value = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return value is not null ? Guid.Parse(value) : null;
    }

    private static string? GetPrimaryKeyValue(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        var key = entry.Metadata.FindPrimaryKey();
        if (key is null) return null;

        var keyValue = key.Properties
            .Select(p => entry.Property(p.Name).CurrentValue)
            .FirstOrDefault(v => v is not null);

        return keyValue?.ToString();
    }
}
