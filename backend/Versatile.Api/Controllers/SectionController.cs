using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Versatile.Application.Section.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/section"), Authorize]
public class SectionController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SectionController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(120)]
    public async Task<ActionResult<List<SectionDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetSectionsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<SectionDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetSectionByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SectionDto>> Create(Guid storyId, [FromBody] CreateSectionCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SectionDto>> Update(Guid id, [FromBody] UpdateSectionCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteSectionCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
