using FluentAssertions;
using FluentValidation;
using MediatR;
using Versatile.Application.Common.Behaviors;

namespace Versatile.Api.Tests.Behaviors;

public class ValidationBehaviorTests
{
    // A minimal request + response for exercising the pipeline behavior.
    public record SampleRequest(string Name) : IRequest<string>;

    private sealed class SampleValidator : AbstractValidator<SampleRequest>
    {
        public SampleValidator()
        {
            RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required");
        }
    }

    private static RequestHandlerDelegate<string> Next(string value, Action? onCalled = null) =>
        (_) =>
        {
            onCalled?.Invoke();
            return Task.FromResult(value);
        };

    [Fact]
    public async Task Passes_through_when_no_validators_registered()
    {
        var behavior = new ValidationBehavior<SampleRequest, string>(Array.Empty<IValidator<SampleRequest>>());
        var called = false;

        var result = await behavior.Handle(
            new SampleRequest("anything"),
            Next("ok", () => called = true),
            CancellationToken.None);

        result.Should().Be("ok");
        called.Should().BeTrue();
    }

    [Fact]
    public async Task Calls_next_when_validation_passes()
    {
        var behavior = new ValidationBehavior<SampleRequest, string>(new[] { new SampleValidator() });
        var called = false;

        var result = await behavior.Handle(
            new SampleRequest("Ada"),
            Next("ok", () => called = true),
            CancellationToken.None);

        result.Should().Be("ok");
        called.Should().BeTrue();
    }

    [Fact]
    public async Task Throws_and_short_circuits_when_validation_fails()
    {
        var behavior = new ValidationBehavior<SampleRequest, string>(new[] { new SampleValidator() });
        var called = false;

        var act = () => behavior.Handle(
            new SampleRequest(""),
            Next("ok", () => called = true),
            CancellationToken.None);

        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Errors.Should().Contain(e => e.ErrorMessage == "Name is required");
        called.Should().BeFalse("next must not run when validation fails");
    }

    [Fact]
    public async Task Aggregates_failures_across_multiple_validators()
    {
        var behavior = new ValidationBehavior<SampleRequest, string>(
            new[] { new SampleValidator(), new SampleValidator() });

        var act = () => behavior.Handle(
            new SampleRequest(""),
            Next("ok"),
            CancellationToken.None);

        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Errors.Should().HaveCountGreaterThanOrEqualTo(2);
    }
}
