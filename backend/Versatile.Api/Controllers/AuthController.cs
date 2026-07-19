using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Versatile.Application.Auth.Commands;
using Versatile.Application.Auth.Queries;
using Versatile.Application.DTOs;

namespace Versatile.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator)
    {
        _mediator = mediator;
    }

    private void SetAuthCookies(AuthResponse result)
    {
        Response.Cookies.Append("access_token", result.Token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = result.ExpiresAt,
            Path = "/"
        });

        Response.Cookies.Append("refresh_token", result.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = DateTime.UtcNow.AddDays(7),
            Path = "/api/auth"
        });
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterCommand command)
    {
        var result = await _mediator.Send(command);
        SetAuthCookies(result);
        return Ok(result);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginCommand command)
    {
        var result = await _mediator.Send(command);
        SetAuthCookies(result);
        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshTokenCommand command)
    {
        var result = await _mediator.Send(command);
        SetAuthCookies(result);
        return Ok(result);
    }

    [HttpGet("me"), Authorize]
    public async Task<ActionResult<UserInfo>> GetMe()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var result = await _mediator.Send(new GetUserInfoQuery(userId));
        return Ok(result);
    }

    [HttpPost("switch-org"), Authorize]
    public async Task<ActionResult<AuthResponse>> SwitchOrg(SwitchOrgRequest request)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var result = await _mediator.Send(new SwitchOrgCommand(userId, request.OrganizationId));
        SetAuthCookies(result);
        return Ok(result);
    }

    [HttpPost("logout"), Authorize]
    public async Task<ActionResult> Logout()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        await _mediator.Send(new LogoutCommand(userId));
        Response.Cookies.Delete("access_token");
        Response.Cookies.Delete("refresh_token");
        return Ok(new { message = "Logged out" });
    }
}
