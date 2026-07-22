using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.CharacterRelationships.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/character-relationship"), Authorize]
public class CharacterRelationshipController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public CharacterRelationshipController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet, Cacheable(120)]
    public async Task<ActionResult<List<CharacterRelationshipDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetCharacterRelationshipsQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}"), Cacheable(300)]
    public async Task<ActionResult<CharacterRelationshipDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetCharacterRelationshipByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<CharacterRelationshipDto>> Create(Guid storyId, CreateCharacterRelationshipCommand command)
    {
        try
        {
            var dto = await _mediator.Send(command with { StoryId = storyId, UserId = UserId, OrganizationId = OrganizationId });
            return CreatedAtAction(nameof(GetById), new { id = dto.Id }, dto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<CharacterRelationshipDto>> Update(Guid id, UpdateCharacterRelationshipCommand command)
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
            await _mediator.Send(new DeleteCharacterRelationshipCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
