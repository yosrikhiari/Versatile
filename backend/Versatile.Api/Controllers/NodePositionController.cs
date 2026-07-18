using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/node-position"), Authorize]
public class NodePositionController : ApiControllerBase
{
    private readonly INodePositionService _service;

    public NodePositionController(INodePositionService service, IOrganizationContext orgContext) : base(orgContext) => _service = service;


    [HttpGet]
    public async Task<ActionResult<List<NodePositionDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _service.GetAllAsync(storyId, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NodePositionDto>> GetById(Guid id)
    {
        try { return Ok(await _service.GetByIdAsync(id, UserId, organizationId: OrganizationId)); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<NodePositionDto>> Create(Guid storyId, CreateNodePositionRequest request)
    {
        try { var dto = await _service.CreateAsync(storyId, request, UserId, organizationId: OrganizationId); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<NodePositionDto>> Update(Guid id, UpdateNodePositionRequest request)
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
