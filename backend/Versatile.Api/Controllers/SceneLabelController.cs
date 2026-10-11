using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.SceneLabels.Commands;
using Versatile.Application.SceneLabels.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/scene-label"), Authorize]
public class SceneLabelController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public SceneLabelController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<SceneLabelDto>>> GetAll([FromQuery] Guid? storyId, [FromQuery] string? reviewerName)
    {
        return Ok(await _mediator.Send(new GetSceneLabelsQuery(storyId, reviewerName, OrganizationId, UserId)));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SceneLabelDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetSceneLabelByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<SceneLabelDto>> Upsert(Guid storyId, UpsertSceneLabelRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new UpsertSceneLabelCommand(
                storyId, request.SceneTitle, request.ReviewerName, request.OverallLabel,
                request.DimensionLabels, request.DimensionScores, request.Notes,
                request.WordCount, request.SceneExcerpt, OrganizationId, UserId));
            return Ok(dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteSceneLabelCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}

public record UpsertSceneLabelRequest(
    string SceneTitle,
    string ReviewerName,
    string OverallLabel,
    Dictionary<string, string> DimensionLabels,
    Dictionary<string, int> DimensionScores,
    string? Notes,
    int WordCount,
    string? SceneExcerpt
);
