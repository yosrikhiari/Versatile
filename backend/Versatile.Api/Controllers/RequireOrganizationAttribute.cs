using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireOrganizationAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        if (ShouldSkip(context)) return;

        var orgCtx = context.HttpContext.RequestServices.GetRequiredService<IOrganizationContext>();
        if (!orgCtx.OrganizationId.HasValue)
        {
            context.Result = new ForbidResult();
        }
    }

    private static bool ShouldSkip(AuthorizationFilterContext context)
    {
        if (context.ActionDescriptor is not ControllerActionDescriptor action) return true;

        var method = action.MethodInfo;
        var controller = action.ControllerTypeInfo;

        if (method.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true).Length > 0) return true;
        if (controller.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true).Length > 0) return true;

        if (method.GetCustomAttributes(typeof(AllowOrganizationOptionalAttribute), inherit: true).Length > 0) return true;
        if (controller.GetCustomAttributes(typeof(AllowOrganizationOptionalAttribute), inherit: true).Length > 0) return true;

        return false;
    }
}
