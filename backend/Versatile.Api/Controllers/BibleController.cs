using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/bible"), Authorize]
public class BibleController : ApiControllerBase
{
    private readonly IBibleService _bible;

    public BibleController(IBibleService bible, IOrganizationContext orgContext) : base(orgContext) => _bible = bible;


    [HttpGet]
    public async Task<ActionResult<List<BibleEntryDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _bible.GetAllAsync(storyId, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<BibleEntryDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _bible.GetByIdAsync(id, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<BibleEntryDto>> Create(Guid storyId, CreateBibleEntryRequest request)
    {
        try
        {
            var entry = await _bible.CreateAsync(storyId, request, UserId, organizationId: OrganizationId);
            return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<BibleEntryDto>> Update(Guid id, UpdateBibleEntryRequest request)
    {
        try
        {
            return Ok(await _bible.UpdateAsync(id, request, UserId, organizationId: OrganizationId));
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
            await _bible.DeleteAsync(id, UserId, organizationId: OrganizationId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
