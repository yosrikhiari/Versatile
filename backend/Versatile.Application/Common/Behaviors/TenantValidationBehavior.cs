using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Common.Behaviors;

public class TenantValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequiresOrganization
{
    private readonly IOrganizationContext _orgContext;

    public TenantValidationBehavior(IOrganizationContext orgContext) => _orgContext = orgContext;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (!_orgContext.OrganizationId.HasValue)
            throw new UnauthorizedAccessException("Organization context is required for this operation.");

        return await next();
    }
}
