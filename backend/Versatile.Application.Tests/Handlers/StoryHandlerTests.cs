using FluentAssertions;
using Moq;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Handlers;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Common;
using Versatile.Domain.Entities;
using Versatile.Domain.Events;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Tests.Handlers;

public class StoryHandlerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid StoryId = Guid.NewGuid();
    private static readonly DateTime Now = DateTime.UtcNow;

    private static Story CreateTestStory() => new()
    {
        Id = StoryId,
        Title = "Test Story",
        Premise = "A test premise",
        Genre = "Fantasy",
        Tone = "Dark",
        WritingStyle = "Descriptive",
        TargetAudience = "Adults",
        UserId = UserId,
        OrganizationId = OrgId,
        CreatedAt = Now,
        UpdatedAt = Now,
    };

    public class CreateStoryHandlerTests
    {
        [Fact]
        public async Task Handle_ValidCommand_CreatesStoryAndReturnsDto()
        {
            var repo = new Mock<IRepository<Story>>();
            var uow = new Mock<IUnitOfWork>();
            var handler = new CreateStoryHandler(repo.Object, uow.Object);
            var command = new CreateStoryCommand("New Story", "Premise", "Sci-Fi", "Light", "Snappy", "Teens", OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Title.Should().Be("New Story");
            result.Premise.Should().Be("Premise");
            result.Genre.Should().Be("Sci-Fi");
            result.Tone.Should().Be("Light");
            result.WritingStyle.Should().Be("Snappy");
            result.TargetAudience.Should().Be("Teens");
            repo.Verify(r => r.AddAsync(It.Is<Story>(s => s.Title == "New Story"), default), Times.Once);
            uow.Verify(u => u.AddDomainEvent(It.IsAny<StoryCreatedEvent>()), Times.Once);
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }
    }

    public class UpdateStoryHandlerTests
    {
        [Fact]
        public async Task Handle_WithOrganizationId_UpdatesAndReturnsDto()
        {
            var story = CreateTestStory();
            var repo = new Mock<IOrganizationOwnedRepository<Story>>();
            repo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var uow = new Mock<IUnitOfWork>();
            uow.Setup(u => u.SaveChangesAsync(default)).ReturnsAsync(1);
            var handler = new UpdateStoryHandler(repo.Object, uow.Object);
            var command = new UpdateStoryCommand(StoryId, "Updated Title", null, null, null, null, null, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Title.Should().Be("Updated Title");
            repo.Verify(r => r.Update(story), Times.Once);
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }

        [Fact]
        public async Task Handle_WithoutOrganizationId_UsesUserScopedLookup()
        {
            var story = CreateTestStory();
            var repo = new Mock<IOrganizationOwnedRepository<Story>>();
            repo.Setup(r => r.GetByIdForUserAsync(StoryId, UserId, default)).ReturnsAsync(story);
            var uow = new Mock<IUnitOfWork>();
            uow.Setup(u => u.SaveChangesAsync(default)).ReturnsAsync(1);
            var handler = new UpdateStoryHandler(repo.Object, uow.Object);
            var command = new UpdateStoryCommand(StoryId, "Updated Title", null, null, null, null, null, null, UserId);

            var result = await handler.Handle(command, default);

            result.Title.Should().Be("Updated Title");
            repo.Verify(r => r.Update(story), Times.Once);
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var repo = new Mock<IOrganizationOwnedRepository<Story>>();
            repo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var uow = new Mock<IUnitOfWork>();
            var handler = new UpdateStoryHandler(repo.Object, uow.Object);
            var command = new UpdateStoryCommand(Guid.NewGuid(), "Title", null, null, null, null, null, OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }
    }

    public class DeleteStoryHandlerTests
    {
        [Fact]
        public async Task Handle_WithOrganizationId_DeletesStory()
        {
            var story = CreateTestStory();
            var repo = new Mock<IOrganizationOwnedRepository<Story>>();
            repo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var uow = new Mock<IUnitOfWork>();
            var handler = new DeleteStoryHandler(repo.Object, uow.Object);
            var command = new DeleteStoryCommand(StoryId, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Should().Be(MediatR.Unit.Value);
            repo.Verify(r => r.Delete(story), Times.Once);
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var repo = new Mock<IOrganizationOwnedRepository<Story>>();
            repo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var uow = new Mock<IUnitOfWork>();
            var handler = new DeleteStoryHandler(repo.Object, uow.Object);
            var command = new DeleteStoryCommand(Guid.NewGuid(), OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }
    }

    public class GetStoryByIdHandlerTests
    {
        [Fact]
        public async Task Handle_StoryFound_ReturnsDto()
        {
            var story = CreateTestStory();
            var repo = new Mock<IRepository<Story>>();
            repo.Setup(r => r.GetAllAsync(It.IsAny<System.Linq.Expressions.Expression<Func<Story, bool>>>(), default))
                .ReturnsAsync(new List<Story> { story });
            var handler = new GetStoryByIdHandler(repo.Object);
            var query = new GetStoryByIdQuery(StoryId, OrgId, UserId);

            var result = await handler.Handle(query, default);

            result.Id.Should().Be(StoryId);
            result.Title.Should().Be("Test Story");
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var repo = new Mock<IRepository<Story>>();
            repo.Setup(r => r.GetAllAsync(It.IsAny<System.Linq.Expressions.Expression<Func<Story, bool>>>(), default))
                .ReturnsAsync(new List<Story>());
            var handler = new GetStoryByIdHandler(repo.Object);
            var query = new GetStoryByIdQuery(Guid.NewGuid(), OrgId, UserId);

            await handler.Invoking(h => h.Handle(query, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }
    }

    public class GetStoriesHandlerTests
    {
        [Fact]
        public async Task Handle_ReturnsPagedStories()
        {
            var stories = new List<Story>
            {
                new() { Id = Guid.NewGuid(), Title = "A", UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now.AddMinutes(1) },
                new() { Id = Guid.NewGuid(), Title = "B", UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
            };
            var repo = new Mock<IRepository<Story>>();
            repo.Setup(r => r.GetPagedAsync(
                    It.IsAny<System.Linq.Expressions.Expression<Func<Story, bool>>>(),
                    1, 20, default))
                .ReturnsAsync((stories, 2));
            var handler = new GetStoriesHandler(repo.Object);
            var query = new GetStoriesQuery(OrgId, UserId, 1, 20);

            var result = await handler.Handle(query, default);

            result.Items.Should().HaveCount(2);
            result.TotalCount.Should().Be(2);
            result.Page.Should().Be(1);
            result.PageSize.Should().Be(20);
            result.Items[0].Title.Should().Be("A");
        }

        [Fact]
        public async Task Handle_NoStories_ReturnsEmptyResponse()
        {
            var repo = new Mock<IRepository<Story>>();
            repo.Setup(r => r.GetPagedAsync(
                    It.IsAny<System.Linq.Expressions.Expression<Func<Story, bool>>>(),
                    1, 20, default))
                .ReturnsAsync((new List<Story>(), 0));
            var handler = new GetStoriesHandler(repo.Object);
            var query = new GetStoriesQuery(OrgId, UserId, 1, 20);

            var result = await handler.Handle(query, default);

            result.Items.Should().BeEmpty();
            result.TotalCount.Should().Be(0);
        }
    }
}
