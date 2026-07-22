using FluentAssertions;
using Moq;
using Versatile.Application.DTOs;
using Versatile.Application.Section.Commands;
using Versatile.Application.Section.Handlers;
using Versatile.Application.Section.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using SectionEntity = Versatile.Domain.Entities.Section;

namespace Versatile.Application.Tests.Handlers;

public class SectionHandlerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid StoryId = Guid.NewGuid();
    private static readonly Guid SectionId = Guid.NewGuid();
    private static readonly DateTime Now = DateTime.UtcNow;

    private static Story CreateTestStory() => new()
    {
        Id = StoryId,
        Title = "Test Story",
        UserId = UserId,
        OrganizationId = OrgId,
        CreatedAt = Now,
        UpdatedAt = Now,
    };

    private static SectionEntity CreateTestSection() => new()
    {
        Id = SectionId,
        StoryId = StoryId,
        Title = "Test Section",
        Summary = "A summary",
        Content = "Some content",
        Order = 1,
        Status = "Draft",
        Tags = "tag1,tag2",
        UserId = UserId,
        OrganizationId = OrgId,
        CreatedAt = Now,
        UpdatedAt = Now,
    };

    public class CreateSectionHandlerTests
    {
        [Fact]
        public async Task Handle_ValidCommand_CreatesSectionWithComputedOrder()
        {
            var story = CreateTestStory();
            var existingSections = new List<SectionEntity>
            {
                new() { Id = Guid.NewGuid(), StoryId = StoryId, Order = 1, Title = "Existing", UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
                new() { Id = Guid.NewGuid(), StoryId = StoryId, Order = 3, Title = "Another", UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
            };
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetAllAsync(It.IsAny<System.Linq.Expressions.Expression<System.Func<SectionEntity, bool>>>(), It.IsAny<CancellationToken>())).ReturnsAsync(existingSections);
            var uow = new Mock<IUnitOfWork>();
            var handler = new CreateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new CreateSectionCommand(StoryId, "New Section", "Summary", "Content", null, null, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Title.Should().Be("New Section");
            result.Order.Should().Be(4);
            result.Status.Should().Be("Draft");
            sectionRepo.Verify(r => r.AddAsync(It.Is<SectionEntity>(s => s.Order == 4), default), Times.Once);
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }

        [Fact]
        public async Task Handle_NoExistingSections_SetsOrderToOne()
        {
            var story = CreateTestStory();
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetAllAsync(It.IsAny<System.Linq.Expressions.Expression<System.Func<SectionEntity, bool>>>(), It.IsAny<CancellationToken>())).ReturnsAsync(new List<SectionEntity>());
            var uow = new Mock<IUnitOfWork>();
            var handler = new CreateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new CreateSectionCommand(StoryId, "First Section", null, null, null, null, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Order.Should().Be(1);
            sectionRepo.Verify(r => r.AddAsync(It.Is<SectionEntity>(s => s.Order == 1), default), Times.Once);
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            var uow = new Mock<IUnitOfWork>();
            var handler = new CreateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new CreateSectionCommand(Guid.NewGuid(), "Title", null, null, null, null, OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }

        [Fact]
        public async Task Handle_UserMismatch_ThrowsKeyNotFoundException()
        {
            var story = CreateTestStory();
            story.UserId = Guid.NewGuid();
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            var uow = new Mock<IUnitOfWork>();
            var handler = new CreateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new CreateSectionCommand(StoryId, "Title", null, null, null, null, OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }
    }

    public class UpdateSectionHandlerTests
    {
        [Fact]
        public async Task Handle_ValidCommand_UpdatesSection()
        {
            var section = CreateTestSection();
            var story = CreateTestStory();
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(SectionId, default)).ReturnsAsync(section);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var uow = new Mock<IUnitOfWork>();
            var handler = new UpdateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new UpdateSectionCommand(SectionId, "Updated Title", null, null, null, "Published", null, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Title.Should().Be("Updated Title");
            result.Status.Should().Be("Published");
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }

        [Fact]
        public async Task Handle_SectionNotFound_ThrowsKeyNotFoundException()
        {
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), default)).ReturnsAsync((SectionEntity?)null);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            var uow = new Mock<IUnitOfWork>();
            var handler = new UpdateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new UpdateSectionCommand(Guid.NewGuid(), "Title", null, null, null, null, null, OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Section not found");
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var section = CreateTestSection();
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(SectionId, default)).ReturnsAsync(section);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var uow = new Mock<IUnitOfWork>();
            var handler = new UpdateSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new UpdateSectionCommand(SectionId, "Title", null, null, null, null, null, OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Section not found");
        }
    }

    public class DeleteSectionHandlerTests
    {
        [Fact]
        public async Task Handle_ValidCommand_DeletesSection()
        {
            var section = CreateTestSection();
            var story = CreateTestStory();
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(SectionId, default)).ReturnsAsync(section);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var uow = new Mock<IUnitOfWork>();
            var handler = new DeleteSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new DeleteSectionCommand(SectionId, OrgId, UserId);

            var result = await handler.Handle(command, default);

            result.Should().Be(MediatR.Unit.Value);
            sectionRepo.Verify(r => r.Delete(section), Times.Once);
            uow.Verify(u => u.SaveChangesAsync(default), Times.Once);
        }

        [Fact]
        public async Task Handle_SectionNotFound_ThrowsKeyNotFoundException()
        {
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), default)).ReturnsAsync((SectionEntity?)null);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            var uow = new Mock<IUnitOfWork>();
            var handler = new DeleteSectionHandler(sectionRepo.Object, storyRepo.Object, uow.Object);
            var command = new DeleteSectionCommand(Guid.NewGuid(), OrgId, UserId);

            await handler.Invoking(h => h.Handle(command, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Section not found");
        }
    }

    public class GetSectionsHandlerTests
    {
        [Fact]
        public async Task Handle_ValidQuery_ReturnsSectionsOrderedByOrder()
        {
            var story = CreateTestStory();
            var sections = new List<SectionEntity>
            {
                new() { Id = Guid.NewGuid(), StoryId = StoryId, Title = "B", Order = 3, UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
                new() { Id = Guid.NewGuid(), StoryId = StoryId, Title = "A", Order = 1, UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
                new() { Id = Guid.NewGuid(), StoryId = StoryId, Title = "C", Order = 2, UserId = UserId, OrganizationId = OrgId, CreatedAt = Now, UpdatedAt = Now },
            };
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetAllAsync(It.IsAny<System.Linq.Expressions.Expression<System.Func<SectionEntity, bool>>>(), It.IsAny<CancellationToken>())).ReturnsAsync(sections);
            var handler = new GetSectionsHandler(sectionRepo.Object, storyRepo.Object);
            var query = new GetSectionsQuery(StoryId, OrgId, UserId);

            var result = await handler.Handle(query, default);

            result.Should().HaveCount(3);
            result[0].Title.Should().Be("A");
            result[1].Title.Should().Be("C");
            result[2].Title.Should().Be("B");
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            var handler = new GetSectionsHandler(sectionRepo.Object, storyRepo.Object);
            var query = new GetSectionsQuery(StoryId, OrgId, UserId);

            await handler.Invoking(h => h.Handle(query, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
        }
    }

    public class GetSectionByIdHandlerTests
    {
        [Fact]
        public async Task Handle_SectionFound_ReturnsDto()
        {
            var section = CreateTestSection();
            var story = CreateTestStory();
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(SectionId, default)).ReturnsAsync(section);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrgId, default)).ReturnsAsync(story);
            var handler = new GetSectionByIdHandler(sectionRepo.Object, storyRepo.Object);
            var query = new GetSectionByIdQuery(SectionId, OrgId, UserId);

            var result = await handler.Handle(query, default);

            result.Id.Should().Be(SectionId);
            result.Title.Should().Be("Test Section");
        }

        [Fact]
        public async Task Handle_SectionNotFound_ThrowsKeyNotFoundException()
        {
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), default)).ReturnsAsync((SectionEntity?)null);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            var handler = new GetSectionByIdHandler(sectionRepo.Object, storyRepo.Object);
            var query = new GetSectionByIdQuery(Guid.NewGuid(), OrgId, UserId);

            await handler.Invoking(h => h.Handle(query, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Section not found");
        }

        [Fact]
        public async Task Handle_StoryNotFound_ThrowsKeyNotFoundException()
        {
            var section = CreateTestSection();
            var sectionRepo = new Mock<IRepository<SectionEntity>>();
            sectionRepo.Setup(r => r.GetByIdAsync(SectionId, default)).ReturnsAsync(section);
            var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
            storyRepo.Setup(r => r.GetByIdForOrganizationAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), default)).ReturnsAsync((Story?)null);
            var handler = new GetSectionByIdHandler(sectionRepo.Object, storyRepo.Object);
            var query = new GetSectionByIdQuery(SectionId, OrgId, UserId);

            await handler.Invoking(h => h.Handle(query, default))
                .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Section not found");
        }
    }
}
