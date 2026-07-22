using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.DTOs;
using Versatile.Application.VoiceProfiles.Commands;
using Versatile.Application.VoiceProfiles.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/voice-profile"), Authorize]
public class VoiceProfileController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public VoiceProfileController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<VoiceProfileDto>>> GetAll(Guid storyId)
    {
        try { return Ok(await _mediator.Send(new GetVoiceProfilesQuery(storyId, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<VoiceProfileDto>> GetById(Guid id)
    {
        try { return Ok(await _mediator.Send(new GetVoiceProfileByIdQuery(id, OrganizationId, UserId))); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<VoiceProfileDto>> Create(Guid storyId, [FromBody] CreateVoiceProfileRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new CreateVoiceProfileCommand(storyId, request.Name, request.Settings, OrganizationId, UserId));
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<VoiceProfileDto>> Update(Guid id, [FromBody] UpdateVoiceProfileRequest request)
    {
        try
        {
            var dto = await _mediator.Send(new UpdateVoiceProfileCommand(id, request.Name, request.Settings, OrganizationId, UserId));
            return Ok(dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try { await _mediator.Send(new DeleteVoiceProfileCommand(id, OrganizationId, UserId)); return NoContent(); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }
}
