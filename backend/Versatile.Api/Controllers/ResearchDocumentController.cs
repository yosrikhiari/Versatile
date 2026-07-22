using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research-document"), Authorize]
[RequestSizeLimit(100_000_000)]
public class ResearchDocumentController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public ResearchDocumentController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<ResearchDocumentDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetResearchDocumentsQuery(storyId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<ResearchDocumentDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetResearchDocumentByIdQuery(id, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchDocumentDto>> Create(Guid storyId, CreateResearchDocumentRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateResearchDocumentCommand(storyId, request.FileName, request.FileType, request.Content, request.Notes, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchDocumentDto>> Update(Guid id, UpdateResearchDocumentRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateResearchDocumentCommand(id, request.FileName, request.FileType, request.Content, request.Notes, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteResearchDocumentCommand(id, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
