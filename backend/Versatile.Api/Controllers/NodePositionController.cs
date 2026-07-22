using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.NodePositions.Commands;
using Versatile.Application.NodePositions.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/node-position"), Authorize]
public class NodePositionController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public NodePositionController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<NodePositionDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetNodePositionsQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NodePositionDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetNodePositionByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<NodePositionDto>> Create(Guid storyId, CreateNodePositionCommand command)
    {
        try
        {
            var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<NodePositionDto>> Update(Guid id, UpdateNodePositionCommand command)
    {
        try
        {
            return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId }));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try
        {
            await _mediator.Send(new DeleteNodePositionCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
