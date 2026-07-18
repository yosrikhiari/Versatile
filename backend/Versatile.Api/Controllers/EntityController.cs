using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/entity"), Authorize]
public class EntityController : ApiControllerBase
{
    private readonly IEntityService _entity;

    public EntityController(IEntityService entity, IOrganizationContext orgContext) : base(orgContext) => _entity = entity;


    [HttpGet]
    public async Task<ActionResult<List<EntityDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _entity.GetAllAsync(storyId, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<EntityDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _entity.GetByIdAsync(id, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<EntityDto>> Create(Guid storyId, CreateEntityRequest request)
    {
        try
        {
            var entity = await _entity.CreateAsync(storyId, request, UserId, organizationId: OrganizationId);
            return CreatedAtAction(nameof(GetById), new { id = entity.Id }, entity);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<EntityDto>> Update(Guid id, UpdateEntityRequest request)
    {
        try
        {
            return Ok(await _entity.UpdateAsync(id, request, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try
        {
            await _entity.DeleteAsync(id, UserId, organizationId: OrganizationId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
