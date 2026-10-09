using System.Net;
using FluentAssertions;
using Versatile.Application.DTOs;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

public sealed class SyncBatchControllerIntegrationTests : ControllerTestBase
{
    public SyncBatchControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Batch_CreatesMultipleRowsInOneRequest()
    {
        var response = await PostAsync($"/api/story/{StoryId}/sync/batch", new
        {
            items = new object[]
            {
                new { table = "sections", action = "create", @ref = "s1", body = new { title = "Batch A" } },
                new { table = "sections", action = "create", @ref = "s2", body = new { title = "Batch B" } },
                new { table = "plotThreads", action = "create", @ref = "p1", body = new { title = "Thread", status = "active" } },
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var batch = await ReadBodyAsync<SyncBatchResponseDto>(response);
        batch.Should().NotBeNull();
        batch!.Items.Should().HaveCount(3);
        batch.Items.Should().OnlyContain(i => i.Ok && i.ApiId.HasValue);
        batch.Items.Select(i => i.Ref).Should().BeEquivalentTo("s1", "s2", "p1");

        var list = await ReadBodyAsync<List<SectionDto>>(await GetAsync($"/api/story/{StoryId}/section"));
        list!.Select(s => s.Title).Should().Contain("Batch A").And.Contain("Batch B");
    }

    [Fact]
    public async Task Batch_UpdatesExistingRow()
    {
        var created = await ReadBodyAsync<SectionDto>(
            await PostAsync($"/api/story/{StoryId}/section", new { title = "Before" }));
        created.Should().NotBeNull();

        var response = await PostAsync($"/api/story/{StoryId}/sync/batch", new
        {
            items = new object[]
            {
                new { table = "sections", action = "update", @ref = "u1", apiId = created!.Id, body = new { title = "After" } },
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var batch = await ReadBodyAsync<SyncBatchResponseDto>(response);
        batch!.Items.Single().Ok.Should().BeTrue();

        var fetched = await ReadBodyAsync<SectionDto>(await GetAsync($"/api/story/{StoryId}/section/{created.Id}"));
        fetched!.Title.Should().Be("After");
    }

    [Fact]
    public async Task Batch_OneBadItemDoesNotFailTheBatch()
    {
        var response = await PostAsync($"/api/story/{StoryId}/sync/batch", new
        {
            items = new object[]
            {
                new { table = "sections", action = "create", @ref = "good", body = new { title = "Kept" } },
                new { table = "nope", action = "create", @ref = "bad-table", body = new { title = "X" } },
                new { table = "sections", action = "frobnicate", @ref = "bad-action", body = new { title = "Y" } },
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var batch = await ReadBodyAsync<SyncBatchResponseDto>(response);
        batch!.Items.Should().HaveCount(3);
        batch.Items.Single(i => i.Ref == "good").Ok.Should().BeTrue();
        batch.Items.Where(i => i.Ref != "good").Should().OnlyContain(i => !i.Ok && i.Error != null);
    }

    [Fact]
    public async Task Batch_WrongStory_FailsItemsNotRequest()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/sync/batch", new
        {
            items = new object[]
            {
                new { table = "sections", action = "create", @ref = "s1", body = new { title = "Orphan" } },
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var batch = await ReadBodyAsync<SyncBatchResponseDto>(response);
        batch!.Items.Single().Ok.Should().BeFalse();
    }

    [Fact]
    public async Task Batch_EmptyItems_Returns400()
    {
        var response = await PostAsync($"/api/story/{StoryId}/sync/batch", new { items = Array.Empty<object>() });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Tombstones_EmptyInitially()
    {
        var response = await GetAsync($"/api/story/{StoryId}/sync/tombstones");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var tombstones = await ReadBodyAsync<List<SyncTombstoneDto>>(response);
        tombstones.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public async Task Tombstones_RecordSectionDelete()
    {
        var created = await ReadBodyAsync<SectionDto>(
            await PostAsync($"/api/story/{StoryId}/section", new { title = "Doomed" }));
        created.Should().NotBeNull();

        var delete = await DeleteAsync($"/api/story/{StoryId}/section/{created!.Id}");
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var tombstones = await ReadBodyAsync<List<SyncTombstoneDto>>(
            await GetAsync($"/api/story/{StoryId}/sync/tombstones"));
        tombstones.Should().ContainSingle(t =>
            t.Table == "sections" && t.RowId == created.Id && t.StoryId == StoryId);
    }

    [Fact]
    public async Task Tombstones_MapCharacterDiscriminator()
    {
        var created = await ReadBodyAsync<EntityDto>(
            await PostAsync($"/api/story/{StoryId}/entity", new { name = "Hero", type = "Character" }));
        created.Should().NotBeNull();

        var delete = await DeleteAsync($"/api/story/{StoryId}/entity/{created!.Id}");
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var tombstones = await ReadBodyAsync<List<SyncTombstoneDto>>(
            await GetAsync($"/api/story/{StoryId}/sync/tombstones"));
        tombstones.Should().ContainSingle(t =>
            t.Table == "characters" && t.RowId == created.Id);
    }

    [Fact]
    public async Task Tombstones_WrongStory_Returns404()
    {
        var response = await GetAsync($"/api/story/{Guid.NewGuid()}/sync/tombstones");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
