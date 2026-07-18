using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/chapter"), Authorize]
public class ChapterController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ChapterController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet]
    public async Task<ActionResult<List<ChapterDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetChaptersQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ChapterDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetChapterByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<ChapterDto>> Create(Guid storyId, CreateChapterCommand command)
    {
        try
        {
            var chapter = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = chapter.Id }, chapter);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ChapterDto>> Update(Guid id, UpdateChapterCommand command)
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
            await _mediator.Send(new DeleteChapterCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
