using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Versatile.Api.Common;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;

namespace Versatile.IntegrationTests.Infrastructure;

[Collection("Controller Tests")]
public abstract class ControllerTestBase : IClassFixture<CustomWebApplicationFactory>, IAsyncLifetime
{
    protected CustomWebApplicationFactory Factory => _factory;
    private readonly CustomWebApplicationFactory _factory;
    private readonly string _scopeName = Guid.NewGuid().ToString("N");
    private IServiceScope? _scope;

    protected ControllerTestBase(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        Client = factory.CreateClient();
    }

    protected HttpClient Client { get; }
    protected Guid UserId => TestAuthDefaults.UserId;
    protected Guid OrgId => TestAuthDefaults.OrgId;

    public virtual async Task InitializeAsync()
    {
        _scope = _factory.Services.CreateScope();
        var db = _scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Organizations.Add(new Organization
        {
            Id = OrgId,
            Name = "Test Org",
            Slug = "test-org"
        });

        db.Stories.Add(new Story
        {
            Id = _storyId,
            Title = "Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        });

        await db.SaveChangesAsync();

        Client.DefaultRequestHeaders.Add("X-Test-UserId", UserId.ToString());
        Client.DefaultRequestHeaders.Add("X-Test-OrgId", OrgId.ToString());
    }

    public virtual async Task DisposeAsync()
    {
        if (_scope is not null)
        {
            var db = _scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Database.EnsureDeletedAsync();
            _scope.Dispose();
        }
    }

    private Guid _storyId = Guid.Parse("CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC");
    protected Guid StoryId => _storyId;

    protected async Task<HttpResponseMessage> GetAsync(string url)
    {
        return await Client.GetAsync(url);
    }

    protected async Task<HttpResponseMessage> PostAsync<T>(string url, T body)
    {
        return await Client.PostAsJsonAsync(url, body);
    }

    protected async Task<HttpResponseMessage> PutAsync<T>(string url, T body)
    {
        return await Client.PutAsJsonAsync(url, body);
    }

    protected async Task<HttpResponseMessage> DeleteAsync(string url)
    {
        return await Client.DeleteAsync(url);
    }

    protected async Task<T?> ReadBodyAsync<T>(HttpResponseMessage response)
    {
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<T>>();
        return envelope is not null ? envelope.Data : default;
    }
}
