using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Versatile.Application.Services;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthService(ApplicationDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Username == request.Username))
            throw new InvalidOperationException("Username already taken");

        if (!string.IsNullOrEmpty(request.Email) && await _db.Users.AnyAsync(u => u.Email == request.Email))
            throw new InvalidOperationException("Email already registered");

        var user = new User
        {
            Username = request.Username,
            Email = request.Email,
            DisplayName = request.DisplayName
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return await GenerateAuthResponseAsync(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == request.Username);
        if (user == null)
            throw new UnauthorizedAccessException("Invalid credentials");

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
            throw new UnauthorizedAccessException("Invalid credentials");

        return await GenerateAuthResponseAsync(user);
    }

    public async Task<AuthResponse> RefreshTokenAsync(string refreshToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);
        if (user == null || user.RefreshTokenExpiresAt < DateTime.UtcNow)
            throw new UnauthorizedAccessException("Invalid or expired refresh token");

        return await GenerateAuthResponseAsync(user);
    }

    public async Task<AuthResponse> SwitchOrgAsync(Guid userId, Guid orgId)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.UserId == userId && m.OrganizationId == orgId);

        if (membership == null)
            throw new UnauthorizedAccessException("You are not a member of this organization");

        var user = await _db.Users.FindAsync(userId)
            ?? throw new UnauthorizedAccessException("User not found");

        return await GenerateAuthResponseAsync(user, orgId);
    }

    public async Task LogoutAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user != null)
        {
            user.RefreshToken = null;
            user.RefreshTokenExpiresAt = null;
            await _db.SaveChangesAsync();
        }
    }

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user, Guid? activeOrgId = null)
    {
        var orgs = await _db.OrganizationMemberships
            .Where(m => m.UserId == user.Id)
            .Select(m => new OrgInfo(m.OrganizationId, m.Organization!.Name, m.Role.ToString()))
            .ToListAsync();

        var activeOrg = activeOrgId.HasValue
            ? orgs.FirstOrDefault(o => o.Id == activeOrgId.Value)
            : orgs.FirstOrDefault();

        var expiresAt = DateTime.UtcNow.AddHours(24);
        var token = GenerateJwtToken(user, expiresAt, orgs, activeOrg);
        var refreshToken = GenerateRefreshToken();
        var refreshExpiresAt = DateTime.UtcNow.AddDays(7);

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiresAt = refreshExpiresAt;
        _db.SaveChanges();

        return new AuthResponse(token, refreshToken, expiresAt,
            new UserInfo(user.Id, user.Username, user.Email, user.DisplayName), orgs);
    }

    private string GenerateJwtToken(User user, DateTime expires, List<OrgInfo> orgs, OrgInfo? activeOrg)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email ?? "")
        };

        if (orgs.Count != 0)
        {
            var orgsJson = JsonSerializer.Serialize(orgs.Select(o => new { o.Id, o.Name, o.Role }));
            claims.Add(new Claim("orgs", orgsJson, JsonClaimValueTypes.JsonArray));
        }

        if (activeOrg != null)
        {
            claims.Add(new Claim("org_id", activeOrg.Id.ToString()));
            claims.Add(new Claim("org_role", activeOrg.Role));
        }

        var jwtSettings = _config.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }
}
