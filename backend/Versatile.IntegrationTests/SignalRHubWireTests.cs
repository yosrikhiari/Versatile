using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

/// <summary>
/// SignalR hub behavior over the real TestServer wire (LongPolling): group
/// join gating, broadcast routing, and entitlement rejection. Generation
/// streaming methods are deliberately NOT invoked here — they would call real
/// AI providers; their bodies are covered by SignalRHubTests unit tests.
/// </summary>
[Collection("Controller Tests")]
public sealed class SignalRHubWireTests : ControllerTestBase
{
    public SignalRHubWireTests(CustomWebApplicationFactory factory) : base(factory) { }

    private HubConnection Connect(string hub)
    {
        return new HubConnectionBuilder()
            .WithUrl(new Uri(Factory.Server.BaseAddress, $"hubs/{hub}"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
                options.Headers["X-Test-UserId"] = UserId.ToString();
                options.Headers["X-Test-OrgId"] = OrgId.ToString();
            })
            .WithAutomaticReconnect(new[] { TimeSpan.Zero })
            .Build();
    }

    [Fact]
    public async Task CollaborationJoin_AllowsOwnedStory()
    {
        await using var connection = Connect("collaboration");
        await connection.StartAsync();

        var act = () => connection.InvokeAsync("JoinStoryGroup", StoryId.ToString());

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task CollaborationJoin_RejectsForeignStory()
    {
        await using var connection = Connect("collaboration");
        await connection.StartAsync();

        var act = () => connection.InvokeAsync("JoinStoryGroup", Guid.NewGuid().ToString());

        // EnableDetailedErrors is off, so the HubException arrives wrapped in
        // the generic server-side message — but it arrives as a rejection,
        // not a join.
        (await act.Should().ThrowAsync<HubException>()).WithMessage("*Story not found*");
    }

    [Fact]
    public async Task CursorMoved_ReachesOtherGroupMemberOnly()
    {
        await using var first = Connect("collaboration");
        await using var second = Connect("collaboration");
        await first.StartAsync();
        await second.StartAsync();
        await first.InvokeAsync("JoinStoryGroup", StoryId.ToString());
        await second.InvokeAsync("JoinStoryGroup", StoryId.ToString());

        var received = new TaskCompletionSource<(string, string)>(TaskCreationOptions.RunContinuationsAsynchronously);
        second.On<string, string>("CursorMoved", (userId, position) => received.TrySetResult((userId, position)));

        var firstReceived = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        first.On<string, string>("CursorMoved", (_, _) => firstReceived.TrySetResult());

        await first.InvokeAsync("CursorMoved", StoryId.ToString(), UserId.ToString(), "line-12");

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        completed.Should().Be(received.Task, "the other group member should receive the broadcast");
        var (userId, position) = await received.Task;
        userId.Should().Be(UserId.ToString());
        position.Should().Be("line-12");
        firstReceived.Task.IsCompleted.Should().BeFalse("the sender must not receive its own OthersInGroup broadcast");
    }

    [Fact]
    public async Task GenerationJoin_RejectsForeignStory()
    {
        await using var connection = Connect("generation");
        await connection.StartAsync();

        var act = () => connection.InvokeAsync("JoinStoryGroup", Guid.NewGuid().ToString());

        // EnableDetailedErrors is off, so the HubException arrives wrapped in
        // the generic server-side message — but it arrives as a rejection,
        // not a join.
        (await act.Should().ThrowAsync<HubException>()).WithMessage("*Story not found*");
    }

    [Fact]
    public async Task GenerationJoin_AllowsOwnedStory()
    {
        await using var connection = Connect("generation");
        await connection.StartAsync();

        var act = () => connection.InvokeAsync("JoinStoryGroup", StoryId.ToString());

        await act.Should().NotThrowAsync();
    }
}
