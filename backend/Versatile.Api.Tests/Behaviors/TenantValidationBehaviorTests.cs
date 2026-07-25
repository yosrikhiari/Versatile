using FluentAssertions;
using MediatR;
using Moq;
using Versatile.Application.Common.Behaviors;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Tests.Behaviors;

public class TenantValidationBehaviorTests
{
    // A request that requires an organization context.
    public record OrgScopedRequest : IRequest<string>, IRequiresOrganization;

    private static RequestHandlerDelegate<string> Next(string value, Action? onCalled = null) =>
        (_) =>
        {
            onCalled?.Invoke();
            return Task.FromResult(value);
        };

    [Fact]
    public async Task Calls_next_when_organization_context_present()
    {
        var orgContext = new Mock<IOrganizationContext>();
        orgContext.SetupGet(x => x.OrganizationId).Returns(Guid.NewGuid());
        var behavior = new TenantValidationBehavior<OrgScopedRequest, string>(orgContext.Object);
        var called = false;

        var result = await behavior.Handle(
            new OrgScopedRequest(),
            Next("ok", () => called = true),
            CancellationToken.None);

        result.Should().Be("ok");
        called.Should().BeTrue();
    }

    [Fact]
    public async Task Throws_and_short_circuits_when_organization_context_missing()
    {
        var orgContext = new Mock<IOrganizationContext>();
        orgContext.SetupGet(x => x.OrganizationId).Returns((Guid?)null);
        var behavior = new TenantValidationBehavior<OrgScopedRequest, string>(orgContext.Object);
        var called = false;

        var act = () => behavior.Handle(
            new OrgScopedRequest(),
            Next("ok", () => called = true),
            CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("*Organization context is required*");
        called.Should().BeFalse("next must not run without an organization context");
    }
}
