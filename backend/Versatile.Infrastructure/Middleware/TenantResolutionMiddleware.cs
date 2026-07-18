using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Services;

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
            var orgCtx = context.RequestServices.GetRequiredService<IOrganizationContext>() as OrganizationContext;

            if (orgCtx != null)
            {
                var orgIdClaim = context.User.FindFirst("org_id")?.Value;
                if (Guid.TryParse(orgIdClaim, out var orgId))
                {
                    orgCtx.OrganizationId = orgId;
                    context.Items["OrganizationId"] = orgId;
                }

                orgCtx.OrganizationRole = context.User.FindFirst("org_role")?.Value;
                context.Items["OrganizationRole"] = orgCtx.OrganizationRole;
            }
        }

        await _next(context);
    }
}
