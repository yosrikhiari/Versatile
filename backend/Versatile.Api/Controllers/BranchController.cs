using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Branches.Commands;
using Versatile.Application.Branches.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

/// <summary>
/// What-if branches of a story. The table existed since the AddBranchesTable
/// migration but had no endpoint, so the client's branch sync posted into a 404.
/// </summary>
[ApiController]
[Route("api/story/{storyId}/branch"), Authorize]
public class BranchController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public BranchController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<BranchDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetBranchesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<BranchDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetBranchByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<BranchDto>> Create(Guid storyId, CreateBranchRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateBranchCommand(storyId, request.Name, request.SourceBranchId, request.Description, request.Status, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { storyId, id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<BranchDto>> Update(Guid id, UpdateBranchRequest request)
    {
        try { return Ok(await _mediator.Send(new UpdateBranchCommand(id, request.Name, request.SourceBranchId, request.Description, request.Status, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteBranchCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
