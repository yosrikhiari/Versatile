using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.BibleEntries.Commands;
using Versatile.Application.BibleEntries.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/bible"), Authorize]
public class BibleController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public BibleController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(300)]
    public async Task<ActionResult<PagedResponse<BibleEntryDto>>> GetAll(Guid storyId, [FromQuery] PagedRequest paged)
    {
        try
        {
            return Ok(await _mediator.Send(new GetBibleEntriesQuery(storyId, OrganizationId, UserId, paged.Page, paged.PageSize)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<BibleEntryDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetBibleEntryByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<BibleEntryDto>> Create(Guid storyId, CreateBibleEntryCommand command)
    {
        try
        {
            var entry = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<BibleEntryDto>> Update(Guid id, UpdateBibleEntryCommand command)
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
            await _mediator.Send(new DeleteBibleEntryCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
