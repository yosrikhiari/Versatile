using System.Security.Claims;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Versatile.Api.Controllers;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Interfaces;

namespace Versatile.Api.Tests.Controllers;

public class StoryControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OrgId = Guid.NewGuid();

    private static (StoryController Controller, Mock<IMediator> Mediator) CreateController()
    {
        var mediator = new Mock<IMediator>();
        var orgContext = new Mock<IOrganizationContext>();
        orgContext.Setup(c => c.OrganizationId).Returns(OrgId);
        orgContext.Setup(c => c.OrganizationRole).Returns("Owner");

        var controller = new StoryController(mediator.Object, orgContext.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, UserId.ToString())
                    }))
                }
            }
        };
        return (controller, mediator);
    }

    [Fact]
    public async Task GetAll_SendsGetStoriesQuery_ReturnsOkWithPagedResponse()
    {
        var (controller, mediator) = CreateController();
        var expected = new PagedResponse<StoryDto>(
            Array.Empty<StoryDto>(), 0, 1, 20);
        mediator.Setup(m => m.Send(
            It.Is<GetStoriesQuery>(q => q.OrganizationId == OrgId && q.UserId == UserId && q.Page == 1 && q.PageSize == 20),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(expected);

        var result = await controller.GetAll(new PagedRequest(1, 20));

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        okResult.Value.Should().BeSameAs(expected);
    }

    [Fact]
    public async Task GetById_WithExistingId_ReturnsOkWithStoryDto()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        var dto = new StoryDto(id, "Test", null, null, null, null, null, DateTime.UtcNow, DateTime.UtcNow);
        mediator.Setup(m => m.Send(
            It.Is<GetStoryByIdQuery>(q => q.Id == id && q.OrganizationId == OrgId && q.UserId == UserId),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(dto);

        var result = await controller.GetById(id);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        okResult.Value.Should().BeSameAs(dto);
    }

    [Fact]
    public async Task GetById_WithMissingId_ReturnsNotFound()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        mediator.Setup(m => m.Send(
            It.IsAny<GetStoryByIdQuery>(),
            It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException("Story not found"));

        var result = await controller.GetById(id);

        result.Result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Create_ReturnsCreatedAtActionWithStoryDto()
    {
        var (controller, mediator) = CreateController();
        var command = new CreateStoryCommand("New Story", null, null, null, null, null, null, Guid.Empty);
        var dto = new StoryDto(Guid.NewGuid(), "New Story", null, null, null, null, null, DateTime.UtcNow, DateTime.UtcNow);
        mediator.Setup(m => m.Send(
            It.Is<CreateStoryCommand>(c => c.Title == "New Story" && c.UserId == UserId && c.OrganizationId == OrgId),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(dto);

        var result = await controller.Create(command);

        var createdResult = result.Result.Should().BeOfType<CreatedAtActionResult>().Subject;
        createdResult.ActionName.Should().Be(nameof(StoryController.GetById));
        createdResult.RouteValues!["id"].Should().Be(dto.Id);
        createdResult.Value.Should().BeSameAs(dto);
    }

    [Fact]
    public async Task Update_WithExistingId_ReturnsOkWithUpdatedDto()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        var command = new UpdateStoryCommand(id, "Updated Title", null, null, null, null, null, null, Guid.Empty);
        var dto = new StoryDto(id, "Updated Title", null, null, null, null, null, DateTime.UtcNow, DateTime.UtcNow);
        mediator.Setup(m => m.Send(
            It.Is<UpdateStoryCommand>(c => c.Id == id && c.UserId == UserId && c.OrganizationId == OrgId),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(dto);

        var result = await controller.Update(id, command);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        okResult.Value.Should().BeSameAs(dto);
    }

    [Fact]
    public async Task Update_WithMissingId_ReturnsNotFound()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        var command = new UpdateStoryCommand(id, "Updated", null, null, null, null, null, null, Guid.Empty);
        mediator.Setup(m => m.Send(
            It.IsAny<UpdateStoryCommand>(),
            It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException("Story not found"));

        var result = await controller.Update(id, command);

        result.Result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Delete_WithExistingId_ReturnsNoContent()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        mediator.Setup(m => m.Send(
            It.Is<DeleteStoryCommand>(c => c.Id == id && c.OrganizationId == OrgId && c.UserId == UserId),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(Unit.Value);

        var result = await controller.Delete(id);

        result.Should().BeOfType<NoContentResult>();
    }

    [Fact]
    public async Task Delete_WithMissingId_ReturnsNotFound()
    {
        var (controller, mediator) = CreateController();
        var id = Guid.NewGuid();
        mediator.Setup(m => m.Send(
            It.IsAny<DeleteStoryCommand>(),
            It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException("Story not found"));

        var result = await controller.Delete(id);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

}
