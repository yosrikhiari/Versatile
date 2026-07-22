using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Handlers;
using Versatile.Domain.Events;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class DomainEventOutboxIntegrationTests
{
    [Fact]
    public async Task CreateStory_PersistsOutboxMessage()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryHandler(new Repository<Domain.Entities.Story>(db), new UnitOfWork(db));
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await handler.Handle(new CreateStoryCommand("Test Story", null, null, null, null, null, orgId, userId), default);

        var messages = await db.OutboxMessages.ToListAsync();
        messages.Should().HaveCount(1);
        var msg = messages[0];
        msg.Type.Should().Be("Versatile.Domain.Events.StoryCreatedEvent");
        msg.ProcessedAt.Should().BeNull();
        msg.RetryCount.Should().Be(0);
        msg.Content.Should().Contain("Test Story");
    }

    [Fact]
    public async Task CreateStory_OutboxContentDeserializesToEvent()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryHandler(new Repository<Domain.Entities.Story>(db), new UnitOfWork(db));
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var result = await handler.Handle(new CreateStoryCommand("Deserialize Test", null, null, null, null, null, orgId, userId), default);

        var msg = await db.OutboxMessages.SingleAsync();
        var deserialized = JsonSerializer.Deserialize<StoryCreatedEvent>(msg.Content);
        deserialized.Should().NotBeNull();
        deserialized!.StoryId.Should().Be(result.Id);
        deserialized.Title.Should().Be("Deserialize Test");
        deserialized.UserId.Should().Be(userId);
    }

    [Fact]
    public async Task CreateStory_EventHasFullTypeName()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryHandler(new Repository<Domain.Entities.Story>(db), new UnitOfWork(db));

        await handler.Handle(new CreateStoryCommand("Type Test", null, null, null, null, null, Guid.NewGuid(), Guid.NewGuid()), default);

        var msg = await db.OutboxMessages.SingleAsync();
        msg.Type.Should().Be(typeof(StoryCreatedEvent).FullName);
    }

    [Fact]
    public async Task OperationWithoutDomainEvents_CreatesNoOutboxMessages()
    {
        var db = CreateDbContext();
        var uow = new UnitOfWork(db);

        var story = new Domain.Entities.Story
        {
            Id = Guid.NewGuid(),
            Title = "No Event Story",
            UserId = Guid.NewGuid(),
            OrganizationId = Guid.NewGuid()
        };
        db.Set<Domain.Entities.Story>().Add(story);
        await uow.SaveChangesAsync(default);

        var messages = await db.OutboxMessages.ToListAsync();
        messages.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateStory_SetsCreatedAtTimestamp()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryHandler(new Repository<Domain.Entities.Story>(db), new UnitOfWork(db));
        var before = DateTime.UtcNow;

        await handler.Handle(new CreateStoryCommand("Timestamp Test", null, null, null, null, null, Guid.NewGuid(), Guid.NewGuid()), default);

        var after = DateTime.UtcNow;
        var msg = await db.OutboxMessages.SingleAsync();
        msg.CreatedAt.Should().BeOnOrAfter(before.AddSeconds(-1));
        msg.CreatedAt.Should().BeOnOrBefore(after.AddSeconds(1));
    }

    [Fact]
    public async Task CreateStory_OutboxMessageHasValidId()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryHandler(new Repository<Domain.Entities.Story>(db), new UnitOfWork(db));

        await handler.Handle(new CreateStoryCommand("Id Test", null, null, null, null, null, Guid.NewGuid(), Guid.NewGuid()), default);

        var msg = await db.OutboxMessages.SingleAsync();
        msg.Id.Should().NotBeEmpty();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Outbox_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
