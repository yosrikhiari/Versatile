using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/research"), Authorize]
[RequestSizeLimit(100_000_000)]
public class ResearchController : ApiControllerBase
{
    private readonly IResearchService _research;

    public ResearchController(IResearchService research, IOrganizationContext orgContext) : base(orgContext) => _research = research;


    [HttpGet]
    public async Task<ActionResult<List<ResearchDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _research.GetAllAsync(storyId, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ResearchDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _research.GetByIdAsync(id, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<ResearchDto>> Create(Guid storyId, CreateResearchRequest request)
    {
        try
        {
            var note = await _research.CreateAsync(storyId, request, UserId, organizationId: OrganizationId);
            return CreatedAtAction(nameof(GetById), new { id = note.Id }, note);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ResearchDto>> Update(Guid id, UpdateResearchRequest request)
    {
        try
        {
            return Ok(await _research.UpdateAsync(id, request, UserId, organizationId: OrganizationId));
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
            await _research.DeleteAsync(id, UserId, organizationId: OrganizationId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
