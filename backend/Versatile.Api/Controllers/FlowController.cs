using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/flow"), Authorize]
public class FlowController : ControllerBase
{
    private readonly IFlowService _flow;

    public FlowController(IFlowService flow) => _flow = flow;

    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    public async Task<ActionResult<FlowDto>> Get(Guid storyId)
    {
        try
        {
            return Ok(await _flow.GetAsync(storyId, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut]
    public async Task<ActionResult<FlowDto>> Upsert(Guid storyId, UpdateFlowRequest request)
    {
        try
        {
            return Ok(await _flow.UpsertAsync(storyId, request, UserId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
