using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Domain.Interfaces;

namespace Versatile.Infrastructure.Middleware;

public class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var orgCtx = context.RequestServices.GetRequiredService<IOrganizationContext>();

            var orgIdClaim = context.User.FindFirst("org_id")?.Value;
            Guid? orgId = Guid.TryParse(orgIdClaim, out var parsed) ? parsed : null;

            orgCtx.SetOrganization(orgId, context.User.FindFirst("org_role")?.Value);

            if (orgId.HasValue)
                context.Items["OrganizationId"] = orgId.Value;
        }

        await _next(context);
    }
}
