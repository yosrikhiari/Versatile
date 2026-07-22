using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Application.GeneratedStories.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/generated-story"), Authorize]
public class GeneratedStoryController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public GeneratedStoryController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet]
    public async Task<ActionResult<List<GeneratedStoryDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetGeneratedStoriesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GeneratedStoryDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetGeneratedStoryByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<GeneratedStoryDto>> Create(Guid storyId, CreateGeneratedStoryCommand command)
    {
        try { var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }); return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<GeneratedStoryDto>> Update(Guid id, UpdateGeneratedStoryCommand command)
    {
        try { return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId })); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteGeneratedStoryCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
