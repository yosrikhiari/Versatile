using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController, Authorize]
[Route("api/[controller]")]
[AllowOrganizationOptional]
public class OrganizationController : ApiControllerBase
{
    private readonly IOrganizationRepository _orgRepo;
    private readonly IRepository<User> _userRepo;

    public OrganizationController(IOrganizationRepository orgRepo, IOrganizationContext org, IRepository<User> userRepo) : base(org)
    {
        _orgRepo = orgRepo;
        _userRepo = userRepo;
    }

    [HttpGet, Cacheable(120)]
    public async Task<ActionResult<List<Organization>>> GetAll()
    {
        var orgs = await _orgRepo.GetUserOrganizationsAsync(UserId);
        return Ok(orgs);
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<Organization>> GetById(Guid id)
    {
        var membership = await _orgRepo.GetMembershipAsync(id, UserId);
        if (membership == null)
            return Forbid();

        var org = await _orgRepo.GetByIdAsync(id);
        return org == null ? NotFound() : Ok(org);
    }

    [HttpPost]
    public async Task<ActionResult<Organization>> Create([FromBody] CreateOrganizationRequest request)
    {
        var org = await _orgRepo.CreateAsync(request.Name, request.Slug, UserId);
        return CreatedAtAction(nameof(GetById), new { id = org.Id }, org);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Organization>> Update(Guid id, [FromBody] UpdateOrganizationRequest request)
    {
        var membership = await _orgRepo.GetMembershipAsync(id, UserId);
        if (membership == null || membership.Role != OrganizationRole.Admin)
            return Forbid();

        var org = await _orgRepo.GetByIdAsync(id);
        if (org == null) return NotFound();

        org.Name = request.Name;
        org.Slug = request.Slug;
        await _orgRepo.UpdateAsync(org);
        return Ok(org);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var membership = await _orgRepo.GetMembershipAsync(id, UserId);
        if (membership == null || membership.Role != OrganizationRole.Admin)
            return Forbid();

        var org = await _orgRepo.GetByIdAsync(id);
        if (org == null) return NotFound();

        await _orgRepo.DeleteAsync(org);
        return NoContent();
    }

    [HttpPost("{id}/invite")]
    public async Task<ActionResult> Invite(Guid id, [FromBody] InviteMemberRequest request)
    {
        var admin = await _orgRepo.GetMembershipAsync(id, UserId);
        if (admin == null || admin.Role != OrganizationRole.Admin)
            return Forbid();

        if (await _orgRepo.IsMemberAsync(id, request.UserId))
            return Conflict(new { message = "User is already a member" });

        // Fail 404 here: without it Postgres throws an FK DbUpdateException (500).
        // (InMemory tests don't enforce FKs, so this only surfaces against real PG.)
        if (await _userRepo.GetByIdAsync(request.UserId) is null)
            return NotFound(new { message = "User not found" });

        await _orgRepo.AddMemberAsync(id, request.UserId, request.Role);
        return Ok(new { message = "User invited" });
    }

    [HttpDelete("{id}/members/{userId}")]
    public async Task<ActionResult> RemoveMember(Guid id, Guid userId)
    {
        var admin = await _orgRepo.GetMembershipAsync(id, UserId);
        if (admin == null || admin.Role != OrganizationRole.Admin)
            return Forbid();

        var membership = await _orgRepo.GetMembershipAsync(id, userId);
        if (membership == null) return NotFound();

        await _orgRepo.RemoveMemberAsync(id, userId);
        return NoContent();
    }
}

public record CreateOrganizationRequest(string Name, string Slug);
public record UpdateOrganizationRequest(string Name, string Slug);
public record InviteMemberRequest(Guid UserId, OrganizationRole Role = OrganizationRole.Member);
