## Current State

### Running Tests
- `dotnet test --no-restore backend/Versatile.sln` — all tests should pass
- `npm test` (frontend) — if applicable

### Provided Instructions
- **Git**: use conventional commits (e.g. `feat:`, `fix:`)
- **Any time you want to learn more about what the user is looking for**: use the `grill-me` or `loop-me` skill
- **Prefer these for UI tasks**: the `design-taste-frontend` skill

## What We Did

### Session 1: ResearchTagCrudIntegrationTests fix
All 13 integration tests now passing.

1. Created `NoOpCacheService.cs` — no-op `ICacheService` for test infrastructure.
2. `CustomWebApplicationFactory.ConfigureTestServices` registers `NoOpCacheService` in place of `RedisCacheService`.
3. `Program.cs`: `CacheResultFilter` gated on `!IsTesting(env)`.
4. `ControllerTestBase.InitializeAsync`: sets `OrganizationId = OrgId` on seeded `Story`.

### Session 2: AI Engineer Phase 2 Review (analysis complete, edits pending)

Ran a targeted AI Engineer review against the `.planning/` doc suite (PRD, AI-SPEC, PLAN). Identified 20+ unaddressed gaps. Filed 8 critical items into active todos:

| # | Gap | Priority | Status |
|---|-----|----------|--------|
| 1 | Budget-Poisoning Attack Surface | Critical | Planned |
| 2 | Embedding-Aware Pruning | High | Planned |
| 3 | Provider Token-Limit Error Handling | Critical | Planned |
| 4 | Structured Output Budget Awareness | High | Planned |
| 5 | Multi-Turn Budget Management Across the Daemon Loop | High | Planned |
| 6 | Daemon Security Hardening + Memory Watchdog | Critical | Planned |
| 7 | Cost Attribution per Generation (by Model + Phase) | Medium | Planned |
| 8 | Semantic Response Caching | Future | Planned |

Detailed edit content was prepared for `PRD.md`, `AI-SPEC.md`, and `PLAN.md`. **No file edits applied yet** — paused on user request.

## File Map

### Core `Versatile.IntegrationTests`
| File | Purpose |
|------|---------|
| `Infrastructure/NoOpCacheService.cs` | No-op `ICacheService` for tests |
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
| `Services/OrganizationContext.cs` | Scoped `OrganizationId` holder, populated by `TenantResolutionMiddleware` |
| `Data/ApplicationDbContext.cs` | Global query filter for tenant isolation |
| `Middleware/TenantResolutionMiddleware.cs` | Reads `org_id` claim |
| `Data/TenantSessionInterceptor.cs` | Sets session-level `app.organization_id` for PostgreSQL |
| `DependencyInjection.cs` | Registers `RedisCacheService` unconditionally |
