using System;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Controllers;

/// <summary>
/// Shared base for authenticated API controllers. Exposes the caller's user id
/// from the JWT NameIdentifier claim, replacing a line that was duplicated
/// verbatim across 34 controllers.
/// </summary>
[RequireOrganization]
public abstract class ApiControllerBase : ControllerBase
{
    private readonly IOrganizationContext _orgContext;

    protected ApiControllerBase(IOrganizationContext orgContext)
    {
        _orgContext = orgContext;
    }

    protected Guid UserId => Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    protected Guid? OrganizationId => _orgContext.OrganizationId;
}
