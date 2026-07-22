using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.GraphGroups.Commands;
using Versatile.Application.GraphGroups.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/graph-group"), Authorize]
public class GraphGroupController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public GraphGroupController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet]
    public async Task<ActionResult<List<GraphGroupDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetGraphGroupsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GraphGroupDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetGraphGroupByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<GraphGroupDto>> Create(Guid storyId, CreateGraphGroupCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<GraphGroupDto>> Update(Guid id, UpdateGraphGroupCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteGraphGroupCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
