using System.Net;
using System.Net.Http.Json;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Domain.Entities;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class DiagnosticTest : ControllerTestBase
{
    public DiagnosticTest(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task ShowError()
    {
        var command = new CreateAuthorProfileCommand(StoryId, "John Doe", "JD", "A bio", null, OrgId, UserId);
        var response = await PostAsync($"/api/story/{StoryId}/author-profile", command);
        var body = await response.Content.ReadAsStringAsync();
        Console.WriteLine($"Status: {(int)response.StatusCode} {response.StatusCode}");
        Console.WriteLine($"Body: {body}");
        foreach (var h in response.Headers)
            Console.WriteLine($"Header: {h.Key} = {string.Join(", ", h.Value)}");
    }
}
