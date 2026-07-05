using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Queries;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/[controller]"), Authorize]
public class StoryController : ControllerBase
{
    private readonly IMediator _mediator;

    public StoryController(IMediator mediator) => _mediator = mediator;

    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<ActionResult<List<StoryDto>>> GetAll() =>
        Ok(await _mediator.Send(new GetStoriesQuery(UserId)));

    [HttpGet("{id}")]
    public async Task<ActionResult<StoryDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetStoryByIdQuery(id, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<StoryDto>> Create(CreateStoryCommand command)
    {
        var story = await _mediator.Send(command with { UserId = UserId });
        return CreatedAtAction(nameof(GetById), new { id = story.Id }, story);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<StoryDto>> Update(Guid id, UpdateStoryCommand command)
    {
        try
        {
            return Ok(await _mediator.Send(command with { Id = id, UserId = UserId }));
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
            await _mediator.Send(new DeleteStoryCommand(id, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
