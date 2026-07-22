using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/chapter/{chapterId}/scene"), Authorize]
public class SceneController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SceneController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;


    [HttpGet, Cacheable(60)]
    public async Task<ActionResult<PagedResponse<SceneDto>>> GetAll(Guid chapterId, [FromQuery] PagedRequest paged)
    {
        try
        {
            return Ok(await _mediator.Send(new GetScenesQuery(chapterId, OrganizationId, UserId, paged.Page, paged.PageSize)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<SceneDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetSceneByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<SceneDto>> Create(Guid chapterId, CreateSceneCommand command)
    {
        try
        {
            var scene = await _mediator.Send(command with { ChapterId = chapterId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = scene.Id }, scene);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<SceneDto>> Update(Guid id, UpdateSceneCommand command)
    {
        try
        {
            return Ok(await _mediator.Send(command with { Id = id, UserId = UserId, OrganizationId = OrganizationId }));
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
            await _mediator.Send(new DeleteSceneCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
