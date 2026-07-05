using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/entity"), Authorize]
public class EntityController : ControllerBase
{
    private readonly IEntityService _entity;

    public EntityController(IEntityService entity) => _entity = entity;

    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<ActionResult<List<EntityDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _entity.GetAllAsync(storyId, UserId));
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
            return Ok(await _entity.GetByIdAsync(id, UserId));
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
            var entity = await _entity.CreateAsync(storyId, request, UserId);
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
            return Ok(await _entity.UpdateAsync(id, request, UserId));
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
            await _entity.DeleteAsync(id, UserId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
