using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/chapter"), Authorize]
public class ChapterController : ApiControllerBase
{
    private readonly IChapterService _chapter;

    public ChapterController(IChapterService chapter) => _chapter = chapter;


    [HttpGet]
    public async Task<ActionResult<List<ChapterDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _chapter.GetAllAsync(storyId, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ChapterDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _chapter.GetByIdAsync(id, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<ChapterDto>> Create(Guid storyId, CreateChapterRequest request)
    {
        try
        {
            var chapter = await _chapter.CreateAsync(storyId, request, UserId);
            return CreatedAtAction(nameof(GetById), new { id = chapter.Id }, chapter);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ChapterDto>> Update(Guid id, UpdateChapterRequest request)
    {
        try
        {
            return Ok(await _chapter.UpdateAsync(id, request, UserId));
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
            await _chapter.DeleteAsync(id, UserId);
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
