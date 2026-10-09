using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Versatile.Infrastructure.Data;

/// <summary>
/// Boot-time provisioning for the least-privilege runtime role
/// (<see cref="RlsTableSets.AppRole"/>).
///
/// Split of responsibilities, by design:
/// <list type="bullet">
/// <item>EF migrations (running under the migration connection, a DDL-capable
/// identity) own <b>schema</b>: tables, the role itself, grants, RLS policies,
/// FORCE RLS. They never see a password.</item>
/// <item>This helper owns the <b>secret</b>: it syncs the role password from
/// the runtime connection string (compose: <c>POSTGRES_APP_PASSWORD</c>) so
/// the password lives only in configuration, never in migration source or
/// git history. Re-running converges (env is the source of truth), which is
/// also the rotation story: change the env var, restart, done.</item>
/// </list>
/// Skipped in the <c>Testing</c> environment (in-memory database) and skipped
/// with a warning when the runtime connection string carries no password —
/// fail-closed: the role then cannot authenticate over TCP.
/// </summary>
public static partial class DatabaseProvisioning
{
    [GeneratedRegex("^[a-z_][a-z0-9_]*$", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex RoleNamePattern();

    public static bool IsValidRoleName(string roleName) =>
        RoleNamePattern().IsMatch(roleName);

    /// <summary>
    /// Builds the ALTER ROLE statement. Pure (no I/O) so it is unit-testable.
    /// <paramref name="quotedPasswordLiteral"/> must be a server-quoted
    /// literal (<c>quote_literal</c> output, single quotes included); the role
    /// name is validated and double-quoted here.
    /// </summary>
    public static string BuildPasswordSyncSql(string roleName, string quotedPasswordLiteral)
    {
        if (!IsValidRoleName(roleName))
            throw new ArgumentException($"Invalid PostgreSQL role name: {roleName}", nameof(roleName));
        ArgumentException.ThrowIfNullOrWhiteSpace(quotedPasswordLiteral);

        return $"ALTER ROLE \"{roleName}\" WITH LOGIN PASSWORD {quotedPasswordLiteral};";
    }

    /// <summary>
    /// Ensures the application role can authenticate with the password from
    /// <paramref name="appConnectionString"/>, using the DDL-capable
    /// <paramref name="adminConnectionString"/>. Idempotent.
    /// </summary>
    public static async Task SyncAppRolePasswordAsync(
        string adminConnectionString,
        string appConnectionString,
        string roleName,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        logger ??= NullLogger.Instance;

        if (!IsValidRoleName(roleName))
            throw new ArgumentException($"Invalid PostgreSQL role name: {roleName}", nameof(roleName));

        var appPassword = new NpgsqlConnectionStringBuilder(appConnectionString).Password;
        if (string.IsNullOrEmpty(appPassword))
        {
            logger.LogWarning(
                "PostgreSQL application role '{Role}' has no password in the runtime connection string; "
                + "skipping password sync. The role will fail to authenticate until one is configured.",
                roleName);
            return;
        }

        await using var conn = new NpgsqlConnection(adminConnectionString);
        await conn.OpenAsync(cancellationToken);

        string quoted;
        await using (var quoteCmd = new NpgsqlCommand("SELECT quote_literal(@p)", conn))
        {
            quoteCmd.Parameters.AddWithValue("p", appPassword);
            quoted = (string)(await quoteCmd.ExecuteScalarAsync(cancellationToken))!;
        }

        await using var alterCmd = new NpgsqlCommand(BuildPasswordSyncSql(roleName, quoted), conn);
        await alterCmd.ExecuteNonQueryAsync(cancellationToken);

        logger.LogInformation("PostgreSQL application role '{Role}' password synced.", roleName);
    }
}
