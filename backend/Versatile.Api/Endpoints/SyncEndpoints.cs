using System.Data;
using System.Security.Claims;
using Dapper;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Versatile.Api.Data;
using Versatile.Api.DTOs;

namespace Versatile.Api.Endpoints;

public static class SyncEndpoints
{
    private static readonly string[] Tables =
    [
        "projects", "manuscripts", "characters", "character_relationships",
        "locations", "plot_threads", "sections", "subsections",
        "chapters", "scenes", "spark_history", "annotations",
        "snippets", "daily_goals", "revision_comments", "story_elements",
        "graph_edges", "graph_groups", "node_positions", "group_edges",
        "snapshots", "volumes", "volume_entities"
    ];

    public static void MapSyncEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/sync").RequireAuthorization();

        group.MapPost("/pull", async (SyncPullRequest req, HttpContext ctx, AppDbContext db) =>
        {
            var userId = ctx.User.FindFirst("user_id")?.Value;
            if (userId is null) return Results.Unauthorized();

            var connStr = db.Database.GetConnectionString();
            await using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync();

            var entities = new List<SyncEntity>();

            foreach (var table in Tables)
            {
                var sql = $"""
                    SELECT row_to_json(t)::text AS data
                    FROM "{table}" t
                    WHERE (updated_at > @Since OR (deleted_at IS NOT NULL AND deleted_at > @Since))
                      AND project_id IN (SELECT id FROM projects WHERE user_id = @UserId::uuid)
                """;

                var rows = await conn.QueryAsync<string>(sql, new { Since = req.Since, UserId = userId });

                foreach (var row in rows)
                {
                    entities.Add(new SyncEntity
                    {
                        Table = table,
                        Data = row,
                        UpdatedAt = req.Since
                    });
                }
            }

            return Results.Ok(new SyncPullResponse
            {
                Entities = entities,
                ServerAt = DateTime.UtcNow
            });
        });

        group.MapPost("/push", async (SyncPushRequest req, AppDbContext db) =>
        {
            var accepted = 0;
            foreach (var entity in req.Entities)
            {
                try
                {
                    var connStr = db.Database.GetConnectionString();
                    await using var conn = new NpgsqlConnection(connStr);
                    await conn.OpenAsync();

                    var sql = $"""
                        INSERT INTO "{entity.Table}" (id, project_id, data)
                        VALUES (@Id, @ProjectId, @Data::jsonb)
                        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
                    """;

                    await conn.ExecuteAsync(sql, new { entity.Id, entity.Data });
                    accepted++;
                }
                catch
                {
                    // skip failed entities
                }
            }

            return Results.Ok(new SyncPushResponse { Accepted = accepted });
        });
    }
}
