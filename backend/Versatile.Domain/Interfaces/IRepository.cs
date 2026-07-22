using System.Linq.Expressions;

namespace Versatile.Domain.Interfaces;

public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<T>> GetAllAsync(Expression<Func<T, bool>>? filter = null, CancellationToken ct = default);
    Task<T> AddAsync(T entity, CancellationToken ct = default);
    void Update(T entity);
    void Delete(T entity);
    Task<int> CountAsync(Expression<Func<T, bool>>? filter = null, CancellationToken ct = default);
    Task<(List<T> Items, int TotalCount)> GetPagedAsync(
        Expression<Func<T, bool>>? filter = null,
        int page = 1,
        int pageSize = 20,
        CancellationToken ct = default);
}

public interface IUserOwnedRepository<T> : IRepository<T> where T : class
{
    Task<List<T>> GetAllForUserAsync(Guid userId, CancellationToken ct = default);
    Task<T?> GetByIdForUserAsync(Guid id, Guid userId, CancellationToken ct = default);
    Task<bool> ExistsForUserAsync(Guid id, Guid userId, CancellationToken ct = default);
}
