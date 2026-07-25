using System.Linq.Expressions;
using FluentAssertions;
using Moq;
using Versatile.Application.Annotations.Handlers;
using Versatile.Application.Annotations.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Tests.Handlers;

public class GetAnnotationsHandlerTests
{
    private static Annotation MakeAnnotation(Guid storyId, Guid userId, Guid orgId, DateTime createdAt, string type = "note")
        => new()
        {
            Id = Guid.NewGuid(),
            StoryId = storyId,
            UserId = userId,
            OrganizationId = orgId,
            ParagraphIndex = 0,
            Type = type,
            Status = "open",
            CreatedAt = createdAt
        };

    [Fact]
    public async Task Returns_annotations_newest_first_and_maps_to_dto()
    {
        var storyId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var older = MakeAnnotation(storyId, userId, orgId, new DateTime(2026, 1, 1), "weak-verb");
        var newer = MakeAnnotation(storyId, userId, orgId, new DateTime(2026, 6, 1), "repetition");

        var repo = new Mock<IRepository<Annotation>>();
        repo.Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Annotation, bool>>>(), It.IsAny<CancellationToken>()))
            // Intentionally return them oldest-first so we prove the handler re-orders.
            .ReturnsAsync(new List<Annotation> { older, newer });

        var handler = new GetAnnotationsHandler(repo.Object);

        var result = await handler.Handle(
            new GetAnnotationsQuery(storyId, orgId, userId),
            CancellationToken.None);

        result.Should().HaveCount(2);
        result[0].Id.Should().Be(newer.Id, "newest annotation should come first");
        result[0].Type.Should().Be("repetition");
        result[1].Id.Should().Be(older.Id);
        result[1].Type.Should().Be("weak-verb");
    }

    [Fact]
    public async Task Returns_empty_list_when_repository_has_none()
    {
        var repo = new Mock<IRepository<Annotation>>();
        repo.Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<Annotation, bool>>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Annotation>());

        var handler = new GetAnnotationsHandler(repo.Object);

        var result = await handler.Handle(
            new GetAnnotationsQuery(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()),
            CancellationToken.None);

        result.Should().BeEmpty();
    }
}
