using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Research.Commands;
using Versatile.Application.Research.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research"), Authorize]
[RequestSizeLimit(100_000_000)]
public class ResearchController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ResearchController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(120)]
    public async Task<ActionResult<List<ResearchDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetResearchNotesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<ResearchDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetResearchNoteByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchDto>> Create(Guid storyId, CreateResearchRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateResearchNoteCommand(storyId, request.Title, request.Content, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchDto>> Update(Guid id, UpdateResearchRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateResearchNoteCommand(id, request.Title, request.Content, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteResearchNoteCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
