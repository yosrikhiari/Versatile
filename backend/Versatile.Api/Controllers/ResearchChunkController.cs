using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Application.ResearchChunks.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research-chunk"), Authorize]
public class ResearchChunkController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ResearchChunkController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<ResearchChunkDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetResearchChunksQuery(storyId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ResearchChunkDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetResearchChunkByIdQuery(id, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchChunkDto>> Create(Guid storyId, CreateResearchChunkRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateResearchChunkCommand(request.DocumentId, storyId, request.ChunkIndex, request.Content, request.Embedding, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchChunkDto>> Update(Guid id, UpdateResearchChunkRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateResearchChunkCommand(id, request.ChunkIndex, request.Content, request.Embedding, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteResearchChunkCommand(id, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
