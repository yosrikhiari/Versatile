using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/session-archive-item"), Authorize]
public class SessionArchiveItemController : ApiControllerBase
{
    private readonly ISessionArchiveItemService _service;

    public SessionArchiveItemController(ISessionArchiveItemService service, IOrganizationContext orgContext) : base(orgContext) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<SessionArchiveItemDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SessionArchiveItemDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SessionArchiveItemDto>> Create(Guid storyId, CreateSessionArchiveItemRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SessionArchiveItemDto>> Update(Guid id, UpdateSessionArchiveItemRequest request)
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
