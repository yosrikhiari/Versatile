using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
using Versatile.Infrastructure.Data;
using Versatile.IntegrationTests.Infrastructure;

namespace Versatile.IntegrationTests;

[Collection("Controller Tests")]
public class OrganizationControllerIntegrationTests : ControllerTestBase
{
    public OrganizationControllerIntegrationTests(CustomWebApplicationFactory factory) : base(factory) { }

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();

        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.OrganizationMemberships.Add(new OrganizationMembership
        {
            OrganizationId = OrgId,
            UserId = UserId,
            Role = OrganizationRole.Admin
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Post_WithValidData_ReturnsCreated()
    {
        var response = await PostAsync<object?>($"/api/Organization?name=NewOrg&slug=new-org", null);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var org = await ReadBodyAsync<Organization>(response);
        org.Should().NotBeNull();
        org!.Name.Should().Be("NewOrg");
    }

    [Fact]
    public async Task GetList_ReturnsUserOrganizations()
    {
        var response = await GetAsync("/api/Organization");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var orgs = await ReadBodyAsync<List<Organization>>(response);
        orgs.Should().NotBeNull();
        orgs!.Should().Contain(o => o.Id == OrgId);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsOk()
    {
        var response = await GetAsync($"/api/Organization/{OrgId}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var org = await ReadBodyAsync<Organization>(response);
        org!.Id.Should().Be(OrgId);
    }

    [Fact]
    public async Task GetById_WithWrongId_ReturnsForbidden()
    {
        var response = await GetAsync($"/api/Organization/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Put_WithValidData_ReturnsUpdatedOrg()
    {
        var response = await PutAsync($"/api/Organization/{OrgId}?name=UpdatedOrg&slug=updated-org", null as object);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var org = await ReadBodyAsync<Organization>(response);
        org!.Name.Should().Be("UpdatedOrg");
    }

    [Fact]
    public async Task Delete_WithValidId_ReturnsNoContent()
    {
        var response = await DeleteAsync($"/api/Organization/{OrgId}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_WithWrongId_ReturnsForbidden()
    {
        var response = await DeleteAsync($"/api/Organization/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Invite_NewUser_ReturnsOk()
    {
        var newUserId = Guid.NewGuid();
        var response = await PostAsync($"/api/Organization/{OrgId}/invite?userId={newUserId}&role=Member", null as object);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Invite_ExistingMember_ReturnsConflict()
    {
        var response = await PostAsync($"/api/Organization/{OrgId}/invite?userId={UserId}&role=Member", null as object);
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task RemoveMember_WithValidData_ReturnsNoContent()
    {
        var memberId = Guid.NewGuid();
        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.OrganizationMemberships.Add(new OrganizationMembership
            {
                OrganizationId = OrgId,
                UserId = memberId,
                Role = OrganizationRole.Member
            });
            await db.SaveChangesAsync();
        }

        var response = await DeleteAsync($"/api/Organization/{OrgId}/members/{memberId}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RemoveMember_NonMember_ReturnsNotFound()
    {
        var response = await DeleteAsync($"/api/Organization/{OrgId}/members/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
