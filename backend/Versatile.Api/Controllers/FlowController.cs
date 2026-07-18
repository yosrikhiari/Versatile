using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/flow"), Authorize]
public class FlowController : ApiControllerBase
{
    private readonly IFlowService _flow;

    public FlowController(IFlowService flow, IOrganizationContext orgContext) : base(orgContext) => _flow = flow;


    [HttpGet]
    public async Task<ActionResult<FlowDto>> Get(Guid storyId)
    {
        try
        {
            return Ok(await _flow.GetAsync(storyId, UserId, organizationId: OrganizationId));
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
            return Ok(await _flow.UpsertAsync(storyId, request, UserId, organizationId: OrganizationId));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
