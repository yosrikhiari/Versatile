using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;
using System.Data.Common;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Data;

public sealed class TenantSessionInterceptor : DbConnectionInterceptor
{
    private readonly IOrganizationContext _orgContext;

    public TenantSessionInterceptor(IOrganizationContext orgContext)
    {
        _orgContext = orgContext;
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        if (connection is NpgsqlConnection npgsql && _orgContext.OrganizationId is { } orgId)
        {
            await using var cmd = npgsql.CreateCommand();
            cmd.CommandText = $"SET SESSION app.organization_id = '{orgId:N}'";
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }
}
