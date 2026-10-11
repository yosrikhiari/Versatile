using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Versatile.Api.Hubs;
using Versatile.Application.DTOs;
using Versatile.Application.Services;

namespace Versatile.Api.Tests.Hubs;

/// <summary>
/// Executes the hub method bodies against mocked SignalR plumbing (no
/// TestHost client package is vendored). Covers what unit tests can reach:
/// entitlement gating, error targeting/genericity, and org pass-through.
/// Real wire behavior (reconnects, backplane fan-out) still needs a live host.
/// </summary>
public class SignalRHubTests
{
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid OrgId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid StoryId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private static ClaimsPrincipal Principal() => new(new ClaimsIdentity(new[]
    {
        new Claim(ClaimTypes.NameIdentifier, UserId.ToString()),
        new Claim("org_id", OrgId.ToString()),
    }));

    private static Mock<HubCallerContext> HubContext(string connectionId = "conn-1")
    {
        var ctx = new Mock<HubCallerContext>();
        ctx.SetupGet(c => c.ConnectionId).Returns(connectionId);
        ctx.SetupGet(c => c.User).Returns(Principal());
        return ctx;
    }

    private sealed class ClientHarness
    {
        public Mock<IHubCallerClients> Clients { get; } = new();
        public Mock<ISingleClientProxy> Caller { get; } = new();
        public Dictionary<string, Mock<IClientProxy>> Groups { get; } = new();
        public Mock<IClientProxy> OthersInGroupProxy { get; } = new();

        public ClientHarness()
        {
            Clients.Setup(c => c.Caller).Returns(Caller.Object);
            Clients.Setup(c => c.Group(It.IsAny<string>()))
                .Returns<string>(name =>
                {
                    if (!Groups.TryGetValue(name, out var proxy))
                    {
                        proxy = new Mock<IClientProxy>();
                        Groups[name] = proxy;
                    }
                    return proxy.Object;
                });
            Clients.Setup(c => c.OthersInGroup(It.IsAny<string>())).Returns(OthersInGroupProxy.Object);
        }

        public IReadOnlyList<(string Method, object?[] Args)> SentToCaller() =>
            Caller.Invocations
                .Where(i => i.Method.Name == nameof(IClientProxy.SendCoreAsync))
                .Select(i => ((string)i.Arguments[0]!, (object?[])i.Arguments[1]!))
                .ToList();

        public IReadOnlyList<(string Method, object?[] Args)> SentToGroup(string name) =>
            Groups.TryGetValue(name, out var proxy)
                ? proxy.Invocations
                    .Where(i => i.Method.Name == nameof(IClientProxy.SendCoreAsync))
                    .Select(i => ((string)i.Arguments[0]!, (object?[])i.Arguments[1]!))
                    .ToList()
                : [];
    }

    private static Mock<IGroupManager> GroupManager() => new();

    private static Mock<IStoryAccessChecker> Access(bool allowed)
    {
        var access = new Mock<IStoryAccessChecker>();
        access.Setup(a => a.CanAccessAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(allowed);
        return access;
    }

    private static async IAsyncEnumerable<string> Chunks(params string[] chunks)
    {
        foreach (var chunk in chunks)
        {
            yield return chunk;
            await Task.Yield();
        }
    }

    private static async IAsyncEnumerable<string> ThrowingChunks(Exception ex)
    {
        await Task.Yield();
        throw ex;
#pragma warning disable CS0162 // Unreachable code detected: yield satisfies the iterator requirement below the throw.
        yield break;
#pragma warning restore CS0162
    }

    [Fact]
    public async Task CollaborationJoin_AllowedJoinsNamespacedGroup()
    {
        var hub = new CollaborationHub(Access(true).Object)
        {
            Context = HubContext().Object,
            Clients = new ClientHarness().Clients.Object,
            Groups = GroupManager().Object,
        };
        var groups = new Mock<IGroupManager>();
        hub.Groups = groups.Object;

        await hub.JoinStoryGroup(StoryId.ToString());

        groups.Verify(g => g.AddToGroupAsync("conn-1", $"{OrgId}_collab_{StoryId}", default), Times.Once);
    }

    [Fact]
    public async Task CollaborationJoin_DeniedThrowsWithoutJoining()
    {
        var hub = new CollaborationHub(Access(false).Object)
        {
            Context = HubContext().Object,
            Clients = new ClientHarness().Clients.Object,
            Groups = GroupManager().Object,
        };
        var groups = new Mock<IGroupManager>();
        hub.Groups = groups.Object;

        var act = () => hub.JoinStoryGroup(StoryId.ToString());

        (await act.Should().ThrowAsync<HubException>()).WithMessage("Story not found.");
        groups.Verify(g => g.AddToGroupAsync(It.IsAny<string>(), It.IsAny<string>(), default), Times.Never);
    }

    [Fact]
    public async Task CollaborationJoin_MalformedIdThrowsWithoutJoining()
    {
        var access = Access(true);
        var hub = new CollaborationHub(access.Object)
        {
            Context = HubContext().Object,
            Clients = new ClientHarness().Clients.Object,
            Groups = GroupManager().Object,
        };
        var groups = new Mock<IGroupManager>();
        hub.Groups = groups.Object;

        var act = () => hub.JoinStoryGroup("not-a-guid");

        (await act.Should().ThrowAsync<HubException>()).WithMessage("Story not found.");
        access.Verify(a => a.CanAccessAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()), Times.Never);
        groups.Verify(g => g.AddToGroupAsync(It.IsAny<string>(), It.IsAny<string>(), default), Times.Never);
    }

    [Fact]
    public async Task Suggestion_StreamsProgressThenCompletesToCaller()
    {
        var ai = new Mock<IAiGenerationService>();
        ai.Setup(a => a.GenerateSuggestionAsync(It.IsAny<GenerateSuggestionRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Chunks("Hello ", "world"));
        var harness = new ClientHarness();
        var hub = new GenerationHub(ai.Object, Mock.Of<IChatProviderFactory>(), Mock.Of<IGeneratedStoryService>(), Access(true).Object, NullLogger<GenerationHub>.Instance)
        {
            Context = HubContext().Object,
            Clients = harness.Clients.Object,
            Groups = GroupManager().Object,
        };

        await hub.GenerateSuggestion(new GenerateSuggestionRequest(StoryId.ToString(), "ctx", "focus", "p", "m"));

        var sent = harness.SentToCaller();
        sent.Count(m => m.Method == "GenerationProgress").Should().Be(2);
        var complete = sent.Single(m => m.Method == "GenerationComplete");
        complete.Args[1].Should().Be("Hello world");
    }

    [Fact]
    public async Task Suggestion_FailureGoesToCallerWithGenericText()
    {
        var ai = new Mock<IAiGenerationService>();
        ai.Setup(a => a.GenerateSuggestionAsync(It.IsAny<GenerateSuggestionRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(ThrowingChunks(new InvalidOperationException("provider exploded: secret-key-xyz")));
        var harness = new ClientHarness();
        var hub = new GenerationHub(ai.Object, Mock.Of<IChatProviderFactory>(), Mock.Of<IGeneratedStoryService>(), Access(true).Object, NullLogger<GenerationHub>.Instance)
        {
            Context = HubContext().Object,
            Clients = harness.Clients.Object,
            Groups = GroupManager().Object,
        };

        await hub.GenerateSuggestion(new GenerateSuggestionRequest(StoryId.ToString(), "ctx", "focus", "p", "m"));

        var sent = harness.SentToCaller();
        var error = sent.Single(m => m.Method == "GenerationError");
        error.Args[1].Should().Be("Generation failed. Please try again.");
        ((string)error.Args[1]!).Should().NotContain("secret-key-xyz");
    }

    [Fact]
    public async Task Continuation_PassesOrgThroughAndBroadcastsCompleteToGroup()
    {
        var ai = new Mock<IAiGenerationService>();
        ai.Setup(a => a.GenerateStoryContinuationAsync(It.IsAny<GenerateContinuationRequest>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Chunks("Once "));
        Guid? capturedOrg = Guid.Empty;
        var story = new Mock<IGeneratedStoryService>();
        story.Setup(s => s.CreateAsync(It.IsAny<Guid>(), It.IsAny<CreateGeneratedStoryRequest>(), It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .Callback<Guid, CreateGeneratedStoryRequest, Guid, Guid?>((_, _, _, org) => capturedOrg = org)
            .ReturnsAsync(new GeneratedStoryDto(Guid.NewGuid(), StoryId, "AI Continuation", "Once ", DateTime.UtcNow, 1, null));
        var harness = new ClientHarness();
        var hub = new GenerationHub(ai.Object, Mock.Of<IChatProviderFactory>(), story.Object, Access(true).Object, NullLogger<GenerationHub>.Instance)
        {
            Context = HubContext().Object,
            Clients = harness.Clients.Object,
            Groups = GroupManager().Object,
        };

        await hub.GenerateContinuation(new GenerateContinuationRequest(StoryId.ToString(), "recent", "p", "m", null, null, null));

        capturedOrg.Should().Be(OrgId);
        var group = harness.SentToGroup($"{OrgId}_story_{StoryId}");
        group.Single(m => m.Method == "GenerationComplete").Args[1].Should().Be("Once ");
    }

    [Fact]
    public async Task Stream_FailureIsGenericToCaller()
    {
        var factory = new Mock<IChatProviderFactory>();
        factory.Setup(f => f.CreateAsync(It.IsAny<string>(), It.IsAny<string>()))
            .ThrowsAsync(new HttpRequestException("conn refused: bearer secret-abc"));
        var harness = new ClientHarness();
        var hub = new GenerationHub(Mock.Of<IAiGenerationService>(), factory.Object, Mock.Of<IGeneratedStoryService>(), Access(true).Object, NullLogger<GenerationHub>.Instance)
        {
            Context = HubContext().Object,
            Clients = harness.Clients.Object,
            Groups = GroupManager().Object,
        };

        await hub.GenerateStream("p", "m", new List<AiMessage> { new("user", "hi") });

        var error = harness.SentToCaller().Single(m => m.Method == "StreamError");
        error.Args[0].Should().Be("Stream failed. Please try again.");
        ((string)error.Args[0]!).Should().NotContain("secret-abc");
    }
}
