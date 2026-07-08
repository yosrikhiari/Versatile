using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/section"), Authorize]
public class SectionController : ApiControllerBase
{
    private readonly ISectionService _service;

    public SectionController(ISectionService service) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<SectionDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SectionDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SectionDto>> Create(Guid storyId, CreateSectionRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SectionDto>> Update(Guid id, UpdateSectionRequest request)
    {
        try { return Ok(await _service.UpdateAsync(id, request, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _service.DeleteAsync(id, UserId); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
