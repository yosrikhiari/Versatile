using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Services;

public class TokenGenerator
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;

    public TokenGenerator(ApplicationDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public async Task<AuthResponse> GenerateAuthResponseAsync(User user, Guid? activeOrgId = null)
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
        await _db.SaveChangesAsync();

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
