using Versatile.Api.Data;
using Versatile.Api.DTOs;

namespace Versatile.Api.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/health", async (AppDbContext db) =>
        {
            try
            {
                await db.Database.CanConnectAsync();
                return Results.Ok(new HealthResponse
                {
                    Status = "ok",
                    Timestamp = DateTime.UtcNow.ToString("o")
                });
            }
            catch
            {
                return Results.Json(new HealthResponse
                {
                    Status = "unhealthy",
                    Timestamp = DateTime.UtcNow.ToString("o")
                }, statusCode: 503);
            }
        });
    }
}
