using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/revision-comment"), Authorize]
public class RevisionCommentController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public RevisionCommentController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<RevisionCommentDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetRevisionCommentsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<RevisionCommentDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetRevisionCommentByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<RevisionCommentDto>> Create(Guid storyId, CreateRevisionCommentRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateRevisionCommentCommand(storyId, request.ParagraphIndex, request.StartOffset, request.EndOffset, request.SelectedText, request.Comment, request.Resolved, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<RevisionCommentDto>> Update(Guid id, UpdateRevisionCommentRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateRevisionCommentCommand(id, request.ParagraphIndex, request.StartOffset, request.EndOffset, request.SelectedText, request.Comment, request.Resolved, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteRevisionCommentCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
