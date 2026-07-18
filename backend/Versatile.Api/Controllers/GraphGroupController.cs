using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/graph-group"), Authorize]
public class GraphGroupController : ApiControllerBase
{
    private readonly IGraphGroupService _service;

    public GraphGroupController(IGraphGroupService service, IOrganizationContext orgContext) : base(orgContext) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<GraphGroupDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GraphGroupDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<GraphGroupDto>> Create(Guid storyId, CreateGraphGroupRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId, organizationId: OrganizationId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<GraphGroupDto>> Update(Guid id, UpdateGraphGroupRequest request)
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
