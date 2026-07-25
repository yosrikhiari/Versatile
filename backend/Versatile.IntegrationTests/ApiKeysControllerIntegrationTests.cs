using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class ApiKeysControllerIntegrationTests : ControllerTestBase
{
    public ApiKeysControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();

        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Users.Add(new User
        {
            Id = UserId,
            Email = "test@example.com",
            DisplayName = "Test User"
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task GetKey_NoKeys_ReturnsNotFound()
    {
        var response = await GetAsync("/api/ApiKeys/openai");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task StoreAndGetKey_StoresAndRetrievesKey()
    {
        var storeResponse = await PutAsync("/api/ApiKeys/openai", new { key = "sk-test-123" });
        storeResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var getResponse = await GetAsync("/api/ApiKeys/openai");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await getResponse.Content.ReadAsStringAsync();
        body.Should().Contain("sk-test-123");
    }

    [Fact]
    public async Task StoreKey_ThenDelete_RemovesKey()
    {
        await PutAsync("/api/ApiKeys/openai", new { key = "sk-test-123" });

        var deleteResponse = await DeleteAsync("/api/ApiKeys/openai");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var getResponse = await GetAsync("/api/ApiKeys/openai");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteKey_NoKeys_ReturnsNotFound()
    {
        var response = await DeleteAsync("/api/ApiKeys/openai");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task TestConnection_UnknownProvider_ReturnsOkWithError()
    {
        var response = await PostAsync("/api/ApiKeys/test", new { provider = "openai", model = "gpt-4" });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListModels_UnknownProvider_ReturnsOkWithError()
    {
        var response = await PostAsync("/api/ApiKeys/openai/models", null as object);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
