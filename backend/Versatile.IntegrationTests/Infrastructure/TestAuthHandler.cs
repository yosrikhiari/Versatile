using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Versatile.IntegrationTests.Infrastructure;

public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Test";

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var userIdHeader = Request.Headers["X-Test-UserId"].FirstOrDefault();
        var orgIdHeader = Request.Headers["X-Test-OrgId"].FirstOrDefault();

        var userId = userIdHeader is not null ? Guid.Parse(userIdHeader) : TestAuthDefaults.UserId;
        var orgId = orgIdHeader is not null ? Guid.Parse(orgIdHeader) : TestAuthDefaults.OrgId;

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("org_id", orgId.ToString()),
            new Claim("org_role", "Admin")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

public static class TestAuthDefaults
{
    public static Guid UserId { get; set; } = Guid.Parse("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA");
    public static Guid OrgId { get; set; } = Guid.Parse("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB");
}
