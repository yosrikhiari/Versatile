using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/character-relationship"), Authorize]
public class CharacterRelationshipController : ApiControllerBase
{
    private readonly ICharacterRelationshipService _service;

    public CharacterRelationshipController(ICharacterRelationshipService service, IOrganizationContext orgContext) : base(orgContext) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<CharacterRelationshipDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<CharacterRelationshipDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<CharacterRelationshipDto>> Create(Guid storyId, CreateCharacterRelationshipRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId, organizationId: OrganizationId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<CharacterRelationshipDto>> Update(Guid id, UpdateCharacterRelationshipRequest request)
    {
        try { return Ok(await _service.UpdateAsync(id, request, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _service.DeleteAsync(id, UserId, organizationId: OrganizationId); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
