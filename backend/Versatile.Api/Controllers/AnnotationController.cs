using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/annotation"), Authorize]
public class AnnotationController : ApiControllerBase
{
    private readonly IAnnotationService _service;

    public AnnotationController(IAnnotationService service) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<AnnotationDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnnotationDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<AnnotationDto>> Create(Guid storyId, CreateAnnotationRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<AnnotationDto>> Update(Guid id, UpdateAnnotationRequest request)
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
