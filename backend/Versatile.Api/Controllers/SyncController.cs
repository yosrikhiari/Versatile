using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.Sync;
using Versatile.Application.Sync.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

/// <summary>
/// Sync acceleration and convergence: batched row upserts (one request per
/// chunk instead of one per row, which met the 100/min rate limit on every
/// book's first push) and tombstones (server-side records of deleted rows so
/// other devices delete their local copies on pull).
/// </summary>
[ApiController]
[Route("api/story/{storyId}/sync"), Authorize]
public class SyncController : ApiControllerBase
{
    public const int MaxBatchItems = 500;

    private readonly IMediator _mediator;
    private readonly SyncBatchDispatcher _batch;

    public SyncController(IMediator mediator, SyncBatchDispatcher batch, IOrganizationContext orgContext)
        : base(orgContext)
    {
        _mediator = mediator;
        _batch = batch;
    }

    [HttpPost("batch")]
    public async Task<ActionResult<SyncBatchResponseDto>> Batch(Guid storyId, [FromBody] SyncBatchRequestDto request)
    {
        if (request?.Items is null || request.Items.Count == 0)
            return BadRequest(new { message = "Batch requires at least one item." });
        if (request.Items.Count > MaxBatchItems)
            return BadRequest(new { message = $"Batch is limited to {MaxBatchItems} items." });

        var items = await _batch.DispatchAsync(storyId, OrganizationId, UserId, request.Items);
        return Ok(new SyncBatchResponseDto(items));
    }

    [HttpGet("tombstones")]
    public async Task<ActionResult<List<SyncTombstoneDto>>> Tombstones(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetSyncTombstonesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
