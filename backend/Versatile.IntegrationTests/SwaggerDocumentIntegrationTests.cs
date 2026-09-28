using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.Swagger;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

/// <summary>
/// The OpenAPI document still describes JWT bearer auth after the move to
/// Swashbuckle 10 / Microsoft.OpenApi 2, whose object model changed (concrete
/// scheme classes, requirements built per document). The endpoint is only
/// served in Development, so the generator is asked directly.
/// </summary>
public sealed class SwaggerDocumentIntegrationTests : ControllerTestBase
{
    public SwaggerDocumentIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public void Document_DeclaresBearerSchemeAndRequiresIt()
    {
        var doc = Factory.Services.GetRequiredService<ISwaggerProvider>().GetSwagger("v1");

        doc.Info.Title.Should().Be("Versatile API");
        doc.Components!.SecuritySchemes!.Should().ContainKey("Bearer");
        var scheme = doc.Components.SecuritySchemes["Bearer"];
        scheme.Type.Should().Be(SecuritySchemeType.Http);
        scheme.Scheme.Should().Be("bearer");
        scheme.BearerFormat.Should().Be("JWT");
        scheme.In.Should().Be(ParameterLocation.Header);

        doc.Security.Should().NotBeNullOrEmpty();
        doc.Security!.SelectMany(r => r.Keys)
            .Should().Contain(k => k.Reference.Id == "Bearer");
    }
}
