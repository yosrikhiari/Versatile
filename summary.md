## Current State

### Running Tests
- `dotnet test --no-restore backend/Versatile.sln` — all tests should pass
- `npm test` (frontend) — if applicable

### Provided Instructions
- **Git**: use conventional commits (e.g. `feat:`, `fix:`)
- **Any time you want to learn more about what the user is looking for**: use the `grill-me` or `loop-me` skill
- **Prefer these for UI tasks**: the `design-taste-frontend` skill

## What We Did

**Completed ResearchTagCrudIntegrationTests fix** (all 13 tests now passing):

1. Created `NoOpCacheService.cs` - a no-op `ICacheService` for test infrastructure.
2. In `CustomWebApplicationFactory.ConfigureTestServices`: registered `NoOpCacheService` in place of `RedisCacheService` (via `RemoveAll<ICacheService>()` + `AddSingleton`).
3. In `Program.cs`: made the `CacheResultFilter` global filter conditional on `!IsTesting(env)`, matching the antiforgery pattern.
4. In `ControllerTestBase.InitializeAsync`: set `OrganizationId = OrgId` on the seeded `Story`.

## File Map

### Core `Versatile.IntegrationTests`
| File | Purpose |
|------|---------|
| `Infrastructure/NoOpCacheService.cs` | New — no-op `ICacheService` for tests |
| `Infrastructure/CustomWebApplicationFactory.cs` | `ConfigureTestServices` replaces `ICacheService` |
| `Infrastructure/ControllerTestBase.cs` | Sets `OrganizationId` on seeded Story |
| `ResearchTagCrudIntegrationTests.cs` | 13 tests, now all passing |

### Core `Versatile.Api`
| File | Purpose |
|------|---------|
| `Program.cs` | `CacheResultFilter` conditional on env |

### Core `Versatile.Infrastructure`
| File | Purpose |
|------|---------|
| `Services/OrganizationContext.cs` | Scoped holder for `OrganizationId`, populated by `TenantResolutionMiddleware` |
| `Data/ApplicationDbContext.cs` | Global query filter: `_tenantId == null \|\| e.OrganizationId == _tenantId` |
| `Middleware/TenantResolutionMiddleware.cs` | Reads `org_id` claim, calls `orgCtx.SetOrganization()` |
| `Data/TenantSessionInterceptor.cs` | Sets session-level `app.organization_id` for PostgreSQL (Npgsql only) |
| `DependencyInjection.cs` | Registers `RedisCacheService` unconditionally (gated by `useNpgsql`); not skippable in tests via DI alone. |
