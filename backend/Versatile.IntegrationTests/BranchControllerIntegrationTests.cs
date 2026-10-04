using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

/// <summary>
/// The branch endpoint the client's sync posts to, and the chapter / scene
/// links to branches and volumes that sync carries (2026-10-04: none of these
/// reached the server before).
/// </summary>
public sealed class BranchControllerIntegrationTests : ControllerTestBase
{
    public BranchControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    private string Branches => $"/api/story/{StoryId}/branch";

    private async Task<BranchDto> CreateBranch(string name, Guid? source = null)
    {
        var response = await PostAsync(Branches, new CreateBranchRequest(name, source, null, null));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await ReadBodyAsync<BranchDto>(response))!;
    }

    private async Task<Guid> SeedOtherStory()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var story = new Story { Title = "Other", UserId = UserId, OrganizationId = OrgId };
        db.Stories.Add(story);
        await db.SaveChangesAsync();
        return story.Id;
    }

    [Fact]
    public async Task Create_ThenList_ReturnsBranchesOldestFirst()
    {
        var main = await CreateBranch("Main");
        var fork = await CreateBranch("What if", main.Id);

        fork.SourceBranchId.Should().Be(main.Id);
        fork.Status.Should().Be("active");

        var list = await ReadBodyAsync<List<BranchDto>>(await GetAsync(Branches));
        list!.Select(b => b.Name).Should().Equal("Main", "What if");
    }

    [Fact]
    public async Task Create_WithSourceFromAnotherStory_Returns404()
    {
        var otherStory = await SeedOtherStory();
        var foreign = await PostAsync($"/api/story/{otherStory}/branch", new CreateBranchRequest("Theirs", null, null, null));
        var foreignDto = await ReadBodyAsync<BranchDto>(foreign);

        var response = await PostAsync(Branches, new CreateBranchRequest("Fork", foreignDto!.Id, null, null));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_WithMissingStory_Returns404()
    {
        var response = await PostAsync($"/api/story/{Guid.NewGuid()}/branch", new CreateBranchRequest("Orphan", null, null, null));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_RenamesAndClearsSource()
    {
        var main = await CreateBranch("Main");
        var fork = await CreateBranch("Fork", main.Id);

        var response = await PutAsync($"{Branches}/{fork.Id}", new UpdateBranchRequest("Renamed", Guid.Empty, "notes", "archived"));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ReadBodyAsync<BranchDto>(response);
        dto!.Name.Should().Be("Renamed");
        dto.SourceBranchId.Should().BeNull();
        dto.Description.Should().Be("notes");
        dto.Status.Should().Be("archived");
    }

    [Fact]
    public async Task Update_CannotMakeABranchItsOwnSource()
    {
        var main = await CreateBranch("Main");

        var response = await PutAsync($"{Branches}/{main.Id}", new UpdateBranchRequest(null, main.Id, null, null));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_RemovesABranchThatChaptersPointAt()
    {
        var fork = await CreateBranch("Fork");
        var section = await ReadBodyAsync<SectionDto>(await PostAsync($"/api/story/{StoryId}/section",
            new { title = "Ch 1", branchId = fork.Id }));
        section!.BranchId.Should().Be(fork.Id);

        (await DeleteAsync($"{Branches}/{fork.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await GetAsync($"{Branches}/{fork.Id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Section_CarriesVolumeBranchAndOrder_AndRejectsAForeignVolume()
    {
        var branch = await CreateBranch("Main");
        var volume = await ReadBodyAsync<VolumeDto>(await PostAsync($"/api/story/{StoryId}/volume", new { title = "Book One" }));

        var created = await PostAsync($"/api/story/{StoryId}/section",
            new { title = "Ch 7", order = 7, volumeId = volume!.Id, branchId = branch.Id });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var dto = await ReadBodyAsync<SectionDto>(created);
        dto!.Order.Should().Be(7);
        dto.VolumeId.Should().Be(volume.Id);
        dto.BranchId.Should().Be(branch.Id);

        // Guid.Empty clears a link; null leaves it.
        var cleared = await ReadBodyAsync<SectionDto>(await PutAsync($"/api/story/{StoryId}/section/{dto.Id}",
            new { volumeId = Guid.Empty }));
        cleared!.VolumeId.Should().BeNull();
        cleared.BranchId.Should().Be(branch.Id);

        var otherStory = await SeedOtherStory();
        var foreignVolume = await ReadBodyAsync<VolumeDto>(await PostAsync($"/api/story/{otherStory}/volume", new { title = "Theirs" }));
        var rejected = await PutAsync($"/api/story/{StoryId}/section/{dto.Id}", new { volumeId = foreignVolume!.Id });
        rejected.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Subsection_CarriesOrderAndBranch_AndMovesBetweenChapters()
    {
        var branch = await CreateBranch("Main");
        var ch1 = await ReadBodyAsync<SectionDto>(await PostAsync($"/api/story/{StoryId}/section", new { title = "Ch 1" }));
        var ch2 = await ReadBodyAsync<SectionDto>(await PostAsync($"/api/story/{StoryId}/section", new { title = "Ch 2" }));

        var created = await PostAsync($"/api/story/{StoryId}/subsection",
            new { sectionId = ch1!.Id, title = "Scene", order = 3, branchId = branch.Id });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var scene = await ReadBodyAsync<SubsectionDto>(created);
        scene!.Order.Should().Be(3);
        scene.BranchId.Should().Be(branch.Id);

        var moved = await ReadBodyAsync<SubsectionDto>(await PutAsync($"/api/story/{StoryId}/subsection/{scene.Id}",
            new { sectionId = ch2!.Id }));
        moved!.SectionId.Should().Be(ch2.Id);
        moved.BranchId.Should().Be(branch.Id);
    }
}
