using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.StoryStateSnapshots.Commands;
using Versatile.Application.StoryStateSnapshots.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/story-state-snapshot"), Authorize]
public class StoryStateSnapshotController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public StoryStateSnapshotController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<StoryStateSnapshotDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetStoryStateSnapshotsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<StoryStateSnapshotDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetStoryStateSnapshotByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<StoryStateSnapshotDto>> Create(Guid storyId, [FromBody] CreateStoryStateSnapshotRequest request)
    {
        try
        {
            var command = new CreateStoryStateSnapshotCommand(storyId, DateTime.UtcNow, request.Data, OrganizationId, UserId);
            var dto = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<StoryStateSnapshotDto>> Update(Guid id, [FromBody] UpdateStoryStateSnapshotRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new UpdateStoryStateSnapshotCommand(id, request.Data, OrganizationId, UserId));
            return Ok(dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteStoryStateSnapshotCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
