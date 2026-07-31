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

### Session 2: Budget-Poisoning Defense (calibration self-defense)

Implemented calibration-system hardening against budget-poisoning probes (Gap 1 sub-item: secure the EWMA baseline):

- Per-model variance/stddev tracking via Welford EWMA in `CalibrationEntry`
- Outlier rejection: samples >2σ from running factor are skipped
- Anomaly-rate auto-reset: >20% rate or 5 consecutive anomalies triggers full reset with `console.warn`
- Convergence-to-1.0 detection: ≥20 samples at factor within 1% of 1.0 with near-zero variance flagged as possible probe
- Exported `getCalibrationHealth()`, `getCalibrationHealthReport()`, `resetModelCalibration()` for diagnostics

Remaining Gap 1 items (prompt sanity caps, prompt-size anomaly detection in `prepareCallBudget`, earlier token estimation) deferred to Session 3 Phase 1 implementation.

### Session 3: AI Pipeline Hardening — Phase 1 done, Phase 2 starting

`planning/AI-PIPELINE-HARDENING.md` status:

| # | Gap | Priority | Phase | Status |
|---|-----|----------|-------|--------|
| 3 | Provider Token-Limit Error Handling | Critical | 1 | ✅ **Done** |
| 1 | Budget-Poisoning Attack Surface | Critical | 1 | ✅ **Done** |
| 5 | Multi-Turn Budget Management | High | 2 | **In progress** |
| 4 | Structured Output Budget Awareness | High | 2 | Planned |
| 7 | Cost Attribution per Generation | Medium | 3 | Planned |
| 6 | Daemon Security Hardening | Critical | 3 | Planned |
| 2 | Embedding-Aware Pruning | High | 4 | Planned |
| 8 | Semantic Response Caching | Future | 4 | Planned |

**Phase 1 (Gaps 3 + 1) deliveries**:
- `prepareCallBudget` — input cap (80K–100K per model), earlier token estimation, `checkPromptSanityCap`
- `isRetryable` — filters non-retryable 400s, handles `TokenLimitError`
- `parseProviderError` — parses token-limit signals from Anthropic/OpenAI/Gemini
- `checkInputBudget` — upgraded from warning to blocking via `InputBudgetExceededError`
- Fallback chain — cascades to next provider on budget/token-limit errors
- `isFeatureAnomaly` + `recordFeatureTokens` — budget-poisoning anomaly detection in EWMA
- Tests covering all of the above

**Phase 2 (Gap 5) starting**: `SessionBudget` class → `aiService.ts` threading → `Delegator.ts` integration → tests.

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
