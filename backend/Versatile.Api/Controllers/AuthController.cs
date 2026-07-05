using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Auth.Commands;
using Versatile.Application.Auth.Queries;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IAuthService _auth;

    public AuthController(IMediator mediator, IAuthService auth)
    {
        _mediator = mediator;
        _auth = auth;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterCommand command)
    {
        var result = await _mediator.Send(command);
        return Ok(result);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginCommand command)
    {
        var result = await _auth.LoginAsync(new LoginRequest(command.Email, command.Password));
        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshTokenCommand command)
    {
        var result = await _auth.RefreshTokenAsync(command.RefreshToken);
        return Ok(result);
    }

    [HttpGet("me"), Authorize]
    public async Task<ActionResult<UserInfo>> GetMe()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var result = await _mediator.Send(new GetUserInfoQuery(userId));
        return Ok(result);
    }

    [HttpPost("logout"), Authorize]
    public async Task<ActionResult> Logout()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        await _auth.LogoutAsync(userId);
        return Ok(new { message = "Logged out" });
    }
}
