using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.AuthorProfiles.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/story/{storyId}/author-profile"), Authorize]
public class AuthorProfileController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public AuthorProfileController(IMediator mediator, IOrganizationContext orgContext) : base(orgContext) => _mediator = mediator;

    [HttpGet]
    public async Task<ActionResult<List<AuthorProfileDto>>> GetAll(Guid storyId)
    {
        try
        {
            return Ok(await _mediator.Send(new GetAuthorProfilesQuery(storyId, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AuthorProfileDto>> GetById(Guid id)
    {
        try
        {
            return Ok(await _mediator.Send(new GetAuthorProfileByIdQuery(id, OrganizationId, UserId)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<ActionResult<AuthorProfileDto>> Create(Guid storyId, CreateAuthorProfileCommand command)
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
    public async Task<ActionResult<AuthorProfileDto>> Update(Guid id, UpdateAuthorProfileCommand command)
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
            await _mediator.Send(new DeleteAuthorProfileCommand(id, OrganizationId, UserId));
            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }
}
