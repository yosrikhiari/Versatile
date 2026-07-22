using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Commands;
using Versatile.Application.Volume.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/volume"), Authorize]
public class VolumeController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public VolumeController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(60)]
    public async Task<ActionResult<PagedResponse<VolumeDto>>> GetAll(Guid storyId, [FromQuery] PagedRequest paged)
    {
        try { return Ok(await _mediator.Send(new GetVolumesQuery(storyId, OrganizationId, UserId, paged.Page, paged.PageSize))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<VolumeDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetVolumeByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<VolumeDto>> Create(Guid storyId, [FromBody] CreateVolumeCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<VolumeDto>> Update(Guid id, [FromBody] UpdateVolumeCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteVolumeCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
