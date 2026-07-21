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

    public OrganizationController(IOrganizationRepository orgRepo, IOrganizationContext org) : base(org)
    {
        _orgRepo = orgRepo;
    }

    [HttpGet]
    public async Task<ActionResult<List<Organization>>> GetAll()
    {
        var orgs = await _orgRepo.GetUserOrganizationsAsync(UserId);
        return Ok(orgs);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Organization>> GetById(Guid id)
    {
        var membership = await _orgRepo.GetMembershipAsync(id, UserId);
        if (membership == null)
            return Forbid();

        var org = await _orgRepo.GetByIdAsync(id);
        return org == null ? NotFound() : Ok(org);
    }

    [HttpPost]
    public async Task<ActionResult<Organization>> Create(string name, string slug)
    {
        var org = await _orgRepo.CreateAsync(name, slug, UserId);
        return CreatedAtAction(nameof(GetById), new { id = org.Id }, org);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Organization>> Update(Guid id, string name, string slug)
    {
        var membership = await _orgRepo.GetMembershipAsync(id, UserId);
        if (membership == null || membership.Role != OrganizationRole.Admin)
            return Forbid();

        var org = await _orgRepo.GetByIdAsync(id);
        if (org == null) return NotFound();

        org.Name = name;
        org.Slug = slug;
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
    public async Task<ActionResult> Invite(Guid id, Guid userId, OrganizationRole role = OrganizationRole.Member)
    {
        var admin = await _orgRepo.GetMembershipAsync(id, UserId);
        if (admin == null || admin.Role != OrganizationRole.Admin)
            return Forbid();

        if (await _orgRepo.IsMemberAsync(id, userId))
            return Conflict(new { message = "User is already a member" });

        await _orgRepo.AddMemberAsync(id, userId, role);
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
