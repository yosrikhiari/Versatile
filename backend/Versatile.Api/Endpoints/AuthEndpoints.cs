using Microsoft.EntityFrameworkCore;
using Versatile.Api.Data;
using Versatile.Api.DTOs;
using Versatile.Api.Models;
using Versatile.Api.Services;

namespace Versatile.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/auth");

        group.MapPost("/register", async (RegisterRequest req, AppDbContext db, JwtService jwt) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "email and password required" });

            if (req.Password.Length < 6)
                return Results.BadRequest(new { error = "password must be at least 6 characters" });

            if (await db.Users.AnyAsync(u => u.Email == req.Email))
                return Results.Conflict(new { error = "email already registered" });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = req.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                DisplayName = req.DisplayName,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            db.Users.Add(user);
            await db.SaveChangesAsync();

            var token = jwt.GenerateToken(user.Id.ToString());

            return Results.Created(string.Empty, new AuthResponse
            {
                Token = token,
                UserId = user.Id.ToString(),
                DisplayName = user.DisplayName
            });
        });

        group.MapPost("/login", async (LoginRequest req, AppDbContext db, JwtService jwt) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "email and password required" });

            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);
            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Results.Unauthorized();

            var token = jwt.GenerateToken(user.Id.ToString());

            return Results.Ok(new AuthResponse
            {
                Token = token,
                UserId = user.Id.ToString(),
                DisplayName = user.DisplayName
            });
        });
    }
}
