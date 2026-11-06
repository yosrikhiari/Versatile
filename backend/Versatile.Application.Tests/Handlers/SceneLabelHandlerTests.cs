using System.Linq.Expressions;
using FluentAssertions;
using Moq;
using Versatile.Application.SceneLabels.Commands;
using Versatile.Application.SceneLabels.Handlers;
using Versatile.Application.SceneLabels.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Tests.Handlers;

public class SceneLabelHandlerTests
{
    private static readonly Guid StoryId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OrganizationId = Guid.NewGuid();

    [Fact]
    public async Task Upsert_SameReviewerCanSaveLabelsForDifferentScenes()
    {
        var labels = new List<SceneLabel>();
        var labelRepository = new Mock<IRepository<SceneLabel>>();
        labelRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(labels.Where(filter.Compile()).ToList()));
        labelRepository
            .Setup(r => r.AddAsync(It.IsAny<SceneLabel>(), It.IsAny<CancellationToken>()))
            .Returns((SceneLabel label, CancellationToken _) =>
            {
                labels.Add(label);
                return Task.FromResult(label);
            });

        var story = new Story { Id = StoryId, UserId = UserId, OrganizationId = OrganizationId };
        var storyRepository = new Mock<IRepository<Story>>();
        storyRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Story, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<Story, bool>> filter, CancellationToken _) =>
                Task.FromResult(new[] { story }.Where(filter.Compile()).ToList()));

        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var handler = new UpsertSceneLabelHandler(labelRepository.Object, storyRepository.Object, unitOfWork.Object);

        await handler.Handle(Command("Chapter 1 / Scene 1"), default);
        await handler.Handle(Command("Chapter 1 / Scene 2"), default);

        labels.Should().HaveCount(2);
        labels.Select(label => label.SceneTitle).Should().BeEquivalentTo(
            "Chapter 1 / Scene 1", "Chapter 1 / Scene 2");
        labelRepository.Verify(r => r.AddAsync(It.IsAny<SceneLabel>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Upsert_RevisitingSameSceneUpdatesOnlyThatReviewersLabel()
    {
        var existing = new SceneLabel
        {
            Id = Guid.NewGuid(),
            StoryId = StoryId,
            SceneTitle = "Chapter 1 / Scene 1",
            ReviewerName = "Reviewer A",
            OverallLabel = "pass",
            UserId = UserId,
            OrganizationId = OrganizationId
        };
        var labels = new List<SceneLabel> { existing };
        var labelRepository = new Mock<IRepository<SceneLabel>>();
        labelRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(labels.Where(filter.Compile()).ToList()));
        var story = new Story { Id = StoryId, UserId = UserId, OrganizationId = OrganizationId };
        var storyRepository = new Mock<IRepository<Story>>();
        storyRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Story, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<Story, bool>> filter, CancellationToken _) =>
                Task.FromResult(new[] { story }.Where(filter.Compile()).ToList()));
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var handler = new UpsertSceneLabelHandler(labelRepository.Object, storyRepository.Object, unitOfWork.Object);

        await handler.Handle(Command("Chapter 1 / Scene 1", "revise"), default);

        labels.Should().ContainSingle();
        existing.OverallLabel.Should().Be("revise");
        labelRepository.Verify(r => r.Update(existing), Times.Once);
        labelRepository.Verify(r => r.AddAsync(It.IsAny<SceneLabel>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Upsert_RenamedSceneWithStableSubsectionIdUpdatesTheSameLabel()
    {
        var subsectionId = Guid.NewGuid();
        var existing = new SceneLabel
        {
            Id = Guid.NewGuid(),
            StoryId = StoryId,
            SubsectionId = subsectionId,
            SceneTitle = "Old title",
            ReviewerName = "Reviewer A",
            OverallLabel = "pass",
            UserId = UserId,
            OrganizationId = OrganizationId
        };
        var labels = new List<SceneLabel> { existing };
        var labelRepository = new Mock<IRepository<SceneLabel>>();
        labelRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(labels.Where(filter.Compile()).ToList()));
        var story = new Story { Id = StoryId, UserId = UserId, OrganizationId = OrganizationId };
        var storyRepository = new Mock<IRepository<Story>>();
        storyRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Story, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<Story, bool>> filter, CancellationToken _) =>
                Task.FromResult(new[] { story }.Where(filter.Compile()).ToList()));
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var handler = new UpsertSceneLabelHandler(labelRepository.Object, storyRepository.Object, unitOfWork.Object);

        await handler.Handle(Command("Renamed title", "revise", subsectionId), default);

        labels.Should().ContainSingle();
        existing.SceneTitle.Should().Be("Renamed title");
        existing.SubsectionId.Should().Be(subsectionId);
        existing.OverallLabel.Should().Be("revise");
        labelRepository.Verify(r => r.AddAsync(It.IsAny<SceneLabel>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Upsert_NewSubsectionIdDoesNotStealALabelBoundToAnotherScene()
    {
        var boundSubsection = Guid.NewGuid();
        var newSubsection = Guid.NewGuid();
        var existing = new SceneLabel
        {
            Id = Guid.NewGuid(),
            StoryId = StoryId,
            SubsectionId = boundSubsection,
            SceneTitle = "Chapter 1 / Scene 1",
            ReviewerName = "Reviewer A",
            OverallLabel = "pass",
            UserId = UserId,
            OrganizationId = OrganizationId
        };
        var labels = new List<SceneLabel> { existing };
        var labelRepository = new Mock<IRepository<SceneLabel>>();
        labelRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(labels.Where(filter.Compile()).ToList()));
        labelRepository
            .Setup(r => r.AddAsync(It.IsAny<SceneLabel>(), It.IsAny<CancellationToken>()))
            .Returns((SceneLabel label, CancellationToken _) =>
            {
                labels.Add(label);
                return Task.FromResult(label);
            });
        var story = new Story { Id = StoryId, UserId = UserId, OrganizationId = OrganizationId };
        var storyRepository = new Mock<IRepository<Story>>();
        storyRepository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Story, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<Story, bool>> filter, CancellationToken _) =>
                Task.FromResult(new[] { story }.Where(filter.Compile()).ToList()));
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var handler = new UpsertSceneLabelHandler(labelRepository.Object, storyRepository.Object, unitOfWork.Object);

        // Same title on purpose: the stable id says this is a different scene.
        await handler.Handle(Command("Chapter 1 / Scene 1", "revise", newSubsection), default);

        labels.Should().HaveCount(2);
        existing.SubsectionId.Should().Be(boundSubsection);
        existing.OverallLabel.Should().Be("pass");
        labels.Should().Contain(l => l.SubsectionId == newSubsection && l.OverallLabel == "revise");
        labelRepository.Verify(r => r.Update(existing), Times.Never);
    }

    [Fact]
    public async Task GetAll_ReturnsOnlyLabelsOwnedByTheAuthenticatedUser()
    {
        var labels = new List<SceneLabel>
        {
            new() { Id = Guid.NewGuid(), StoryId = StoryId, UserId = UserId, OrganizationId = OrganizationId },
            new() { Id = Guid.NewGuid(), StoryId = StoryId, UserId = Guid.NewGuid(), OrganizationId = OrganizationId }
        };
        var repository = new Mock<IRepository<SceneLabel>>();
        repository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(labels.Where(filter.Compile()).ToList()));

        var result = await new GetSceneLabelsHandler(repository.Object).Handle(
            new GetSceneLabelsQuery(StoryId, null, OrganizationId, UserId), default);

        result.Should().ContainSingle().Which.Id.Should().Be(labels[0].Id);
    }

    [Fact]
    public async Task GetById_DoesNotExposeAnotherUsersLabelWithinTheSameOrganization()
    {
        var label = new SceneLabel
        {
            Id = Guid.NewGuid(),
            StoryId = StoryId,
            UserId = Guid.NewGuid(),
            OrganizationId = OrganizationId
        };
        var repository = new Mock<IRepository<SceneLabel>>();
        repository
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SceneLabel, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SceneLabel, bool>> filter, CancellationToken _) =>
                Task.FromResult(new[] { label }.Where(filter.Compile()).ToList()));

        await new GetSceneLabelByIdHandler(repository.Object)
            .Invoking(handler => handler.Handle(new GetSceneLabelByIdQuery(label.Id, OrganizationId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Label not found");
    }

    private static UpsertSceneLabelCommand Command(
        string title,
        string overall = "pass",
        Guid? subsectionId = null) => new(
        StoryId,
        subsectionId,
        title,
        "Reviewer A",
        overall,
        new Dictionary<string, string>(),
        new Dictionary<string, int>(),
        null,
        100,
        null,
        OrganizationId,
        UserId);
}
