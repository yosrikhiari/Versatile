using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Repositories;

public class Repository<T> : IRepository<T> where T : BaseEntity
{
    protected readonly DbContext DbContext;
    protected readonly DbSet<T> DbSet;

    public Repository(DbContext dbContext)
    {
        DbContext = dbContext;
        DbSet = dbContext.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await DbSet.FirstOrDefaultAsync(e => e.Id == id, ct);

    public async Task<List<T>> GetAllAsync(Expression<Func<T, bool>>? filter = null, CancellationToken ct = default) =>
        filter is null
            ? await DbSet.ToListAsync(ct)
            : await DbSet.Where(filter).ToListAsync(ct);

    public async Task<T> AddAsync(T entity, CancellationToken ct = default)
    {
        await DbSet.AddAsync(entity, ct);
        return entity;
    }

    public void Update(T entity) => DbSet.Update(entity);

    public void Delete(T entity) => DbSet.Remove(entity);

    public async Task<int> CountAsync(Expression<Func<T, bool>>? filter = null, CancellationToken ct = default) =>
        filter is null
            ? await DbSet.CountAsync(ct)
            : await DbSet.CountAsync(filter, ct);

    public async Task<(List<T> Items, int TotalCount)> GetPagedAsync(
        Expression<Func<T, bool>>? filter = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken ct = default)
    {
        var query = filter is null ? DbSet.AsQueryable() : DbSet.Where(filter);
        var totalCount = await query.CountAsync(ct);
        var items = await query
            .OrderBy(e => e.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
        return (items, totalCount);
    }
}
