using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/[controller]"), Authorize]
public class StoryController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public StoryController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(60)]
    public async Task<ActionResult<PagedResponse<StoryDto>>> GetAll([FromQuery] PagedRequest paged) =>
        Ok(await _mediator.Send(new GetStoriesQuery(OrganizationId, UserId, paged.Page, paged.PageSize)));

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<StoryDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetStoryByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<StoryDto>> Create(CreateStoryCommand command)
    {
        var story = await _mediator.Send(command with { UserId = UserId, OrganizationId = OrganizationId });
        return CreatedAtAction(nameof(GetById), new { id = story.Id }, story);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<StoryDto>> Update(Guid id, UpdateStoryCommand command)
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
            await _mediator.Send(new DeleteStoryCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
