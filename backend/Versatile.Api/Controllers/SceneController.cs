using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/chapter/{chapterId}/scene"), Authorize]
public class SceneController : ApiControllerBase
{
    private readonly ISceneService _scene;

    public SceneController(ISceneService scene) => _scene = scene;


    [HttpGet]
    public async Task<ActionResult<List<SceneDto>>> GetAll(Guid chapterId)
    {
        try
        {
            return Ok(await _scene.GetAllAsync(chapterId, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SceneDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _scene.GetByIdAsync(id, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<SceneDto>> Create(Guid chapterId, CreateSceneRequest request)
    {
        try
        {
            var scene = await _scene.CreateAsync(chapterId, request, UserId);
            return CreatedAtAction(nameof(GetById), new { id = scene.Id }, scene);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SceneDto>> Update(Guid id, UpdateSceneRequest request)
    {
        try
        {
            return Ok(await _scene.UpdateAsync(id, request, UserId));
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
            await _scene.DeleteAsync(id, UserId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
