using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/plot-thread"), Authorize]
public class PlotThreadController : ApiControllerBase
{
    private readonly IPlotThreadService _service;

    public PlotThreadController(IPlotThreadService service) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<PlotThreadDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PlotThreadDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<PlotThreadDto>> Create(Guid storyId, CreatePlotThreadRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<PlotThreadDto>> Update(Guid id, UpdatePlotThreadRequest request)
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
