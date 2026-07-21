using System.Text.Json;
using Versatile.Domain.Common;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private readonly List<IDomainEvent> _domainEvents = [];

    public UnitOfWork(ApplicationDbContext context) => _context = context;

    public void AddDomainEvent(IDomainEvent domainEvent) =>
        _domainEvents.Add(domainEvent);

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var outboxMessages = _domainEvents
            .Select(e => new OutboxMessage
            {
                Id = Guid.CreateVersion7(),
                Type = e.GetType().FullName!,
                Content = JsonSerializer.Serialize(e, e.GetType()),
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (outboxMessages.Count > 0)
        {
            _context.OutboxMessages.AddRange(outboxMessages);
            _domainEvents.Clear();
        }

        return await _context.SaveChangesAsync(ct);
    }
}
