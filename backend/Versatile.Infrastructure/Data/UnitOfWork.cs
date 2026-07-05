using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

public class UnitOfWork : IUnitOfWork
{
    private readonly Microsoft.EntityFrameworkCore.DbContext _context;
    public UnitOfWork(Microsoft.EntityFrameworkCore.DbContext context) => _context = context;
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => _context.SaveChangesAsync(ct);
}
