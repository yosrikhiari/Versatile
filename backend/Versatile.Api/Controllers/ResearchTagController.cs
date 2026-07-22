using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Application.ResearchTags.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research-tag"), Authorize]
public class ResearchTagController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ResearchTagController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(300)]
    public async Task<ActionResult<List<ResearchTagDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetResearchTagsQuery(storyId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<ResearchTagDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetResearchTagByIdQuery(id, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchTagDto>> Create(Guid storyId, CreateResearchTagRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateResearchTagCommand(request.Name, storyId, request.Color, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchTagDto>> Update(Guid id, UpdateResearchTagRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateResearchTagCommand(id, request.Name, request.Color, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteResearchTagCommand(id, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
