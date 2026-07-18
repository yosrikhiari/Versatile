using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Subsection.Commands;
using Versatile.Application.Subsection.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/subsection"), Authorize]
public class SubsectionController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SubsectionController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<SubsectionDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetSubsectionsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SubsectionDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetSubsectionByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SubsectionDto>> Create(Guid storyId, [FromBody] CreateSubsectionCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SubsectionDto>> Update(Guid id, [FromBody] UpdateSubsectionCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteSubsectionCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
