using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.GraphEdges.Commands;
using Versatile.Application.GraphEdges.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/graph-edge"), Authorize]
public class GraphEdgeController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public GraphEdgeController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet]
    public async Task<ActionResult<List<GraphEdgeDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetGraphEdgesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GraphEdgeDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetGraphEdgeByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<GraphEdgeDto>> Create(Guid storyId, CreateGraphEdgeCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<GraphEdgeDto>> Update(Guid id, UpdateGraphEdgeCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteGraphEdgeCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
