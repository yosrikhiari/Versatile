using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/annotation"), Authorize]
public class AnnotationController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public AnnotationController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<AnnotationDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetAnnotationsQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnnotationDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetAnnotationByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<AnnotationDto>> Create(Guid storyId, CreateAnnotationRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateAnnotationCommand(storyId, request.ParagraphIndex, request.ParagraphId, request.Type, request.Original, request.Suggestion, request.Reason, request.Status, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<AnnotationDto>> Update(Guid id, UpdateAnnotationRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateAnnotationCommand(id, request.ParagraphIndex, request.ParagraphId, request.Type, request.Original, request.Suggestion, request.Reason, request.Status, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteAnnotationCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
