using System;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace Versatile.Api.Controllers;

/// <summary>
/// Shared base for authenticated API controllers. Exposes the caller's user id
/// from the JWT NameIdentifier claim, replacing a line that was duplicated
/// verbatim across 34 controllers.
/// </summary>
public abstract class ApiControllerBase : ControllerBase
{
    protected Guid UserId => Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
}
