using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.VolumeEntities.Commands;
using Versatile.Application.VolumeEntities.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/volume-entity"), Authorize]
public class VolumeEntityController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public VolumeEntityController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<VolumeEntityDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetVolumeEntitiesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<VolumeEntityDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetVolumeEntityByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<VolumeEntityDto>> Create(Guid storyId, [FromBody] CreateVolumeEntityRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateVolumeEntityCommand(storyId, request.VolumeId, request.EntityType, request.EntityId, request.IsPrimary ?? false, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<VolumeEntityDto>> Update(Guid id, [FromBody] UpdateVolumeEntityRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new UpdateVolumeEntityCommand(id, request.VolumeId, request.EntityType, request.EntityId, request.IsPrimary, OrganizationId, UserId));
            return Ok(dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteVolumeEntityCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
