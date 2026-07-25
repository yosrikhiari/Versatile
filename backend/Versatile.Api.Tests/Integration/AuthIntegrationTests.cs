using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using Versatile.Application.Auth.Commands;
using Versatile.Application.Auth.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Enums;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Handlers.Auth;
using Versatile.Infrastructure.Services;

namespace Versatile.Api.Tests.Integration;

public sealed class AuthIntegrationTests
{
    private const string JwtKey = "this-is-a-test-key-min-16-chars!!";

    // ===== Register =====

    [Fact]
    public async Task Register_WithValidData_ReturnsAuthResponseWithToken()
    {
        var db = CreateDbContext();
        var handler = CreateRegisterHandler(db);

        var result = await handler.Handle(
            new RegisterCommand("test@test.com", "testuser", "Password123!"), default);

        result.Should().NotBeNull();
        result.Token.Should().NotBeNullOrEmpty();
        result.RefreshToken.Should().NotBeNullOrEmpty();
        result.User.Username.Should().Be("testuser");
        result.User.Email.Should().Be("test@test.com");
    }

    [Fact]
    public async Task Register_DuplicateUsername_ThrowsInvalidOperationException()
    {
        var db = CreateDbContext();
        SeedUser(db, "takenuser", "taken@test.com");
        var handler = CreateRegisterHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(
                new RegisterCommand("other@test.com", "takenuser", "Password123!"), default))
            .Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Username already taken");
    }

    [Fact]
    public async Task Register_DuplicateEmail_ThrowsInvalidOperationException()
    {
        var db = CreateDbContext();
        SeedUser(db, "firstuser", "dup@test.com");
        var handler = CreateRegisterHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(
                new RegisterCommand("dup@test.com", "seconduser", "Password123!"), default))
            .Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Email already registered");
    }

    // ===== Login =====

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsAuthResponse()
    {
        var db = CreateDbContext();
        var user = CreateUserWithPassword(db, "loginuser", "login@test.com", "CorrectPassword1!");

        var result = await CreateLoginHandler(db).Handle(
            new LoginCommand("loginuser", "CorrectPassword1!"), default);

        result.Should().NotBeNull();
        result.Token.Should().NotBeNullOrEmpty();
        result.User.Username.Should().Be("loginuser");
    }

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorizedAccessException()
    {
        var db = CreateDbContext();
        CreateUserWithPassword(db, "secureuser", "secure@test.com", "CorrectPassword1!");

        await FluentActions
            .Awaiting(() => CreateLoginHandler(db).Handle(
                new LoginCommand("secureuser", "WrongPassword1!"), default))
            .Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("Invalid credentials");
    }

    [Fact]
    public async Task Login_NonExistentUser_ThrowsUnauthorizedAccessException()
    {
        var db = CreateDbContext();

        await FluentActions
            .Awaiting(() => CreateLoginHandler(db).Handle(
                new LoginCommand("ghost", "anyPassword1!"), default))
            .Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("Invalid credentials");
    }

    // ===== Refresh Token =====

    [Fact]
    public async Task RefreshToken_WithValidToken_ReturnsNewTokens()
    {
        var db = CreateDbContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "refreshuser",
            Email = "refresh@test.com",
            PasswordHash = "hash",
            RefreshToken = "valid-refresh-token",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1)
        };
        db.Users.Add(user);
        db.SaveChanges();

        var result = await CreateRefreshTokenHandler(db).Handle(
            new RefreshTokenCommand("valid-refresh-token"), default);

        result.Should().NotBeNull();
        result.Token.Should().NotBeNullOrEmpty();
        result.RefreshToken.Should().NotBeNullOrEmpty();
        result.RefreshToken.Should().NotBe("valid-refresh-token");
    }

    [Fact]
    public async Task RefreshToken_WithExpiredToken_ThrowsUnauthorizedAccessException()
    {
        var db = CreateDbContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "expireduser",
            Email = "expired@test.com",
            PasswordHash = "hash",
            RefreshToken = "expired-token",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(-1)
        };
        db.Users.Add(user);
        db.SaveChanges();

        await FluentActions
            .Awaiting(() => CreateRefreshTokenHandler(db).Handle(
                new RefreshTokenCommand("expired-token"), default))
            .Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("Invalid or expired refresh token");
    }

    [Fact]
    public async Task RefreshToken_NonExistentToken_ThrowsUnauthorizedAccessException()
    {
        var db = CreateDbContext();

        await FluentActions
            .Awaiting(() => CreateRefreshTokenHandler(db).Handle(
                new RefreshTokenCommand("non-existent-token"), default))
            .Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("Invalid or expired refresh token");
    }

    // ===== Switch Org =====

    [Fact]
    public async Task SwitchOrg_AsMember_ReturnsAuthResponseWithNewOrg()
    {
        var db = CreateDbContext();
        var org = new Organization { Id = Guid.NewGuid(), Name = "Target Org", Slug = "target" };
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "switchuser",
            Email = "switch@test.com",
            PasswordHash = "hash"
        };
        var membership = new OrganizationMembership
        {
            UserId = user.Id,
            OrganizationId = org.Id,
            Role = OrganizationRole.Member
        };
        db.Organizations.Add(org);
        db.Users.Add(user);
        db.OrganizationMemberships.Add(membership);
        db.SaveChanges();

        var result = await CreateSwitchOrgHandler(db).Handle(
            new SwitchOrgCommand(user.Id, org.Id), default);

        result.Should().NotBeNull();
        result.Token.Should().NotBeNullOrEmpty();
        result.Organizations.Should().Contain(o => o.Id == org.Id);
    }

    [Fact]
    public async Task SwitchOrg_NonMember_ThrowsUnauthorizedAccessException()
    {
        var db = CreateDbContext();

        await FluentActions
            .Awaiting(() => CreateSwitchOrgHandler(db).Handle(
                new SwitchOrgCommand(Guid.NewGuid(), Guid.NewGuid()), default))
            .Should().ThrowAsync<UnauthorizedAccessException>()
            .WithMessage("You are not a member of this organization");
    }

    // ===== Logout =====

    [Fact]
    public async Task Logout_ClearsRefreshToken()
    {
        var db = CreateDbContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "logoutuser",
            Email = "logout@test.com",
            PasswordHash = "hash",
            RefreshToken = "will-be-cleared",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1)
        };
        db.Users.Add(user);
        db.SaveChanges();

        await new LogoutCommandHandler(db).Handle(new LogoutCommand(user.Id), default);

        var reloaded = await db.Users.FindAsync(user.Id);
        reloaded!.RefreshToken.Should().BeNull();
        reloaded.RefreshTokenExpiresAt.Should().BeNull();
    }

    [Fact]
    public async Task Logout_NonExistentUser_DoesNotThrow()
    {
        var db = CreateDbContext();

        await FluentActions
            .Awaiting(() => new LogoutCommandHandler(db).Handle(
                new LogoutCommand(Guid.NewGuid()), default))
            .Should().NotThrowAsync();
    }

    // ===== Get User Info =====

    [Fact]
    public async Task GetUserInfo_WithValidUserId_ReturnsUserInfo()
    {
        var db = CreateDbContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "infouser",
            Email = "info@test.com",
            DisplayName = "Info User",
            PasswordHash = "hash"
        };
        db.Users.Add(user);
        db.SaveChanges();

        var result = await new GetUserInfoQueryHandler(db).Handle(
            new GetUserInfoQuery(user.Id), default);

        result.Should().NotBeNull();
        result.Username.Should().Be("infouser");
        result.Email.Should().Be("info@test.com");
        result.DisplayName.Should().Be("Info User");
    }

    [Fact]
    public async Task GetUserInfo_NonExistentUser_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();

        await FluentActions
            .Awaiting(() => new GetUserInfoQueryHandler(db).Handle(
                new GetUserInfoQuery(Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage("User not found");
    }

    // ===== Helpers =====

    private static User CreateUserWithPassword(ApplicationDbContext db, string username, string email, string password)
    {
        var hasher = new PasswordHasher<User>();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            Email = email,
            DisplayName = username,
            PasswordHash = "placeholder"
        };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    private static void SeedUser(ApplicationDbContext db, string username, string email)
    {
        CreateUserWithPassword(db, username, email, "Password123!");
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"AuthTest_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static IConfiguration CreateJwtConfig()
    {
        var mockJwt = new Mock<IConfigurationSection>();
        mockJwt.Setup(x => x["Key"]).Returns(JwtKey);
        mockJwt.Setup(x => x["Issuer"]).Returns("TestIssuer");
        mockJwt.Setup(x => x["Audience"]).Returns("TestAudience");

        var mockConfig = new Mock<IConfiguration>();
        mockConfig.Setup(x => x.GetSection("Jwt")).Returns(mockJwt.Object);
        return mockConfig.Object;
    }

    private static RegisterCommandHandler CreateRegisterHandler(ApplicationDbContext db) =>
        new(db, new TokenGenerator(db, CreateJwtConfig()));

    private static LoginCommandHandler CreateLoginHandler(ApplicationDbContext db) =>
        new(db, new TokenGenerator(db, CreateJwtConfig()));

    private static RefreshTokenCommandHandler CreateRefreshTokenHandler(ApplicationDbContext db) =>
        new(db, new TokenGenerator(db, CreateJwtConfig()));

    private static SwitchOrgCommandHandler CreateSwitchOrgHandler(ApplicationDbContext db) =>
        new(db, new TokenGenerator(db, CreateJwtConfig()));

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
