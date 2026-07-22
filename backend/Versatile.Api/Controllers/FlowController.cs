using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Flows.Commands;
using Versatile.Application.Flows.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/flow"), Authorize]
public class FlowController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public FlowController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet, Cacheable(300)]
    public async Task<ActionResult<FlowDto>> Get(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetFlowQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut]
    public async Task<ActionResult<FlowDto>> Upsert(Guid storyId, UpdateFlowCommand command)
    {
        try
        {
            return Ok(await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId }));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
