using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Snapshots.Commands;
using Versatile.Application.Snapshots.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/snapshot"), Authorize]
public class SnapshotController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SnapshotController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<SnapshotDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetSnapshotsQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SnapshotDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetSnapshotByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<SnapshotDto>> Create(Guid storyId, CreateSnapshotCommand command)
    {
        try
        {
            var snapshot = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = snapshot.Id }, snapshot);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SnapshotDto>> Update(Guid id, UpdateSnapshotCommand command)
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
            await _mediator.Send(new DeleteSnapshotCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
