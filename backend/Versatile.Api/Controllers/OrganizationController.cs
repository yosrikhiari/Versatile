using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;

namespace Versatile.Api.Controllers;

[ApiController, Authorize]
[Route("api/[controller]")]
[AllowOrganizationOptional]
public class OrganizationController : ApiControllerBase
{
    private readonly ApplicationDbContext _db;

    public OrganizationController(ApplicationDbContext db, IOrganizationContext org) : base(org)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<Organization>>> GetAll()
    {
        var orgs = await _db.OrganizationMemberships
            .Where(m => m.UserId == UserId)
            .Include(m => m.Organization)
            .Select(m => m.Organization)
            .ToListAsync();
        return Ok(orgs);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Organization>> GetById(Guid id)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == UserId);
        if (membership == null)
            return Forbid();

        var org = await _db.Organizations.FindAsync(id);
        return org == null ? NotFound() : Ok(org);
    }

    [HttpPost]
    public async Task<ActionResult<Organization>> Create(string name, string slug)
    {
        var org = new Organization { Name = name, Slug = slug };
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        _db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = org.Id,
            UserId = UserId,
            Role = OrganizationRole.Admin
        });
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = org.Id }, org);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Organization>> Update(Guid id, string name, string slug)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == UserId && m.Role == OrganizationRole.Admin);
        if (membership == null)
            return Forbid();

        var org = await _db.Organizations.FindAsync(id);
        if (org == null) return NotFound();

        org.Name = name;
        org.Slug = slug;
        await _db.SaveChangesAsync();
        return Ok(org);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == UserId && m.Role == OrganizationRole.Admin);
        if (membership == null)
            return Forbid();

        var org = await _db.Organizations.FindAsync(id);
        if (org == null) return NotFound();

        _db.Organizations.Remove(org);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/invite")]
    public async Task<ActionResult> Invite(Guid id, Guid userId, OrganizationRole role = OrganizationRole.Member)
    {
        var admin = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == UserId && m.Role == OrganizationRole.Admin);
        if (admin == null)
            return Forbid();

        if (await _db.OrganizationMemberships.AnyAsync(m => m.OrganizationId == id && m.UserId == userId))
            return Conflict(new { message = "User is already a member" });

        _db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = id,
            UserId = userId,
            Role = role
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "User invited" });
    }

    [HttpDelete("{id}/members/{userId}")]
    public async Task<ActionResult> RemoveMember(Guid id, Guid userId)
    {
        var admin = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == UserId && m.Role == OrganizationRole.Admin);
        if (admin == null)
            return Forbid();

        var membership = await _db.OrganizationMemberships
            .FirstOrDefaultAsync(m => m.OrganizationId == id && m.UserId == userId);
        if (membership == null) return NotFound();

        _db.OrganizationMemberships.Remove(membership);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
