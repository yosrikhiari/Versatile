using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.Snippets.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/snippet"), Authorize]
public class SnippetController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SnippetController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<SnippetDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetSnippetsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SnippetDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetSnippetByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SnippetDto>> Create(Guid storyId, CreateSnippetRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateSnippetCommand(storyId, request.Word, request.Count, request.LastSeen, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SnippetDto>> Update(Guid id, UpdateSnippetRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateSnippetCommand(id, request.Word, request.Count, request.LastSeen, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteSnippetCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
