# Deployment

The SPA runs entirely in the browser against IndexedDB and local Ollama; the
.NET backend is optional and adds accounts, organisations, cloud sync and
server-side AI. Everything below is read from `docker-compose.yml`,
`.env.example`, `Dockerfile`, `backend/Dockerfile`, `nginx.conf` and the CI
workflows as they are today.

## Prerequisites

- **Node.js** 22.22+ — CI runs 22.x; the frontend image builds on `node:22-alpine`
- **npm** 9+
- **.NET 10 SDK** — only to build or run the backend outside Docker
- **Docker** — for the compose stack
- **Git**

Optional: `psql` for inspecting Postgres; Ollama on the host for local AI.

## Local development

### 1. Infrastructure

```bash
docker compose up -d postgres redis
```

Starts PostgreSQL 16 (`versatile-postgres`, port 5432, `postgres/postgres`,
database `versatile`) and Redis 7 (`versatile-redis`, append-only). Both have
health checks. Redis publishes no host port and `appsettings.json` has no
`ConnectionStrings:Redis`, so an API started with `dotnet run` runs without
the response cache (the cache fails open); set `ConnectionStrings__Redis` and
map a port if you want it locally.

### 2. Backend

```bash
cd backend/Versatile.Api
dotnet run
```

Listens on `http://localhost:5171` (`launchSettings.json`, environment
`Development`). On start it applies EF migrations (skipped only in the
`Testing` environment), seeds a default organization into an empty database
in Development, exposes `/health`, and Swagger at `/swagger` in Development. Configuration comes from
`appsettings.json` overridden by environment variables (`Section__Key` form).

### 3. Frontend

```bash
npm install
npm run dev
```

Vite serves `http://localhost:5173` and proxies:

| Path      | Target                   | Notes                            |
| --------- | ------------------------ | -------------------------------- |
| `/api`    | `http://localhost:5171`  | REST                             |
| `/hubs`   | `http://localhost:5171`  | SignalR, `ws: true`              |
| `/ollama` | `http://localhost:11434` | prefix stripped                  |
| `/sdapi`  | `http://127.0.0.1:7860`  | Stable Diffusion WebUI (portraits) |

### 4. Verify

- `http://localhost:5173` loads; log in with the local demo account
  (`test` / `test123` — seeded into the browser's IndexedDB by Vite dev
  builds only, never by a production build or into a non-empty DB).
- `curl http://localhost:5171/health` → 200.

## Full stack with Docker Compose

```bash
cp .env.example .env        # then set JWT_KEY and ENCRYPTION_MASTER_KEY
docker compose --profile frontend up --build
```

| Service    | Image / build              | Port        | Profile    | Notes                                                                 |
| ---------- | -------------------------- | ----------- | ---------- | --------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`       | 5432        | default    | volume `pgdata`                                                       |
| `redis`    | `redis:7-alpine`           | —           | default    | volume `redisdata`; GET response cache only (fails open)              |
| `api`      | `backend/Dockerfile`       | 5171 → 8080 | default    | waits for both health checks; `curl /health`; runs migrations on boot |
| `frontend` | root `Dockerfile` (nginx)  | 8080 → 80   | `frontend` | proxies `/api/`, `/hubs/`, `/health` to `api:8080` same-origin        |
| `ollama`   | `ollama/ollama:latest`     | 11434       | `ollama`   | volume `ollamadata`; the api's default `Ai__Ollama__BaseUrl` resolves to it |

The `api` port mapping is published for debugging; behind the frontend
service it is not needed — remove the `ports` block to keep the API reachable
only through nginx.

The frontend image serves Vite's pre-compressed `.gz` assets (`gzip_static`),
long-caches `/assets/` (immutable, 1y), never caches `index.html`, and falls
back to `index.html` for client-side routes. It listens dual-stack so its own
health check (which resolves `localhost` to `::1` first) passes.

## Environment variables

`.env` is read by compose; names are mapped to the backend's configuration
sections (`JWT_KEY` → `Jwt__Key`). Generate secrets with
`openssl rand -base64 48`.

### Required (the API fails fast, naming the missing variable)

| Variable                | Maps to                 | Description                       |
| ----------------------- | ----------------------- | --------------------------------- |
| `JWT_KEY`               | `Jwt__Key`              | Symmetric signing key, 32+ chars  |
| `ENCRYPTION_MASTER_KEY` | `Encryption__MasterKey` | Encrypts stored per-user API keys, 32+ chars |

Compose refuses to start without either. Outside Development the API also
rejects a value shorter than 32 characters or still holding the
`appsettings.json` placeholder (`RequireStrongSecret` in `Program.cs`).

### Optional

| Variable            | Maps to                                 | Default                          | Description                                                 |
| ------------------- | --------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `POSTGRES_DB/USER/PASSWORD` | `ConnectionStrings__DefaultConnection` | `versatile` / `postgres` / `postgres` | Override the password in production                  |
| `JWT_ISSUER`        | `Jwt__Issuer`                           | `Versatile.Api`                  |                                                             |
| `JWT_AUDIENCE`      | `Jwt__Audience`                         | `Versatile.App`                  |                                                             |
| `OPENAI_API_KEY`    | `Ai__OpenAi__ApiKey`                    | inert placeholder                | Server-side fallback; users normally store their own keys via the API. Compose maps an empty value to the placeholder; setting `Ai__OpenAi__ApiKey` to an **empty string** directly trips the DI guard, so leave it unset instead |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | `Ai__Anthropic__ApiKey` / `Ai__Gemini__ApiKey` / `Ai__Groq__ApiKey` | empty | Server-side fallbacks used when a user has no stored key |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | `Ai__Cloudflare__ApiToken` / `Ai__Cloudflare__AccountId` | empty | Workers AI needs both |
| `MISTRAL_API_KEY`   | `Ai__MistralKey`                        | —                                | Server-proxied embeddings (`POST /api/embedding/mistral`)   |
| `OLLAMA_BASE_URL`   | `Ai__Ollama__BaseUrl`                   | `http://ollama:11434`            | Resolves inside compose when the `ollama` profile is active; outside compose the code default is `http://localhost:11434` |
| `Cors__AllowedOrigins__0` | —                                 | —                                | Only when the API is reached cross-origin; compose is same-origin |
| `ConnectionStrings__Redis` | —                                | `redis:6379` in compose          | unset outside compose                                       |
| `ASPNETCORE_ENVIRONMENT`   | —                                | `Production` in the image        | `Development` drops the `Secure` flag on auth cookies, skips the strong-secret check, seeds a default org and enables Swagger; `Testing` disables migrations-on-boot and the response cache and uses an in-memory database |

The frontend has no build-time secrets: AI provider keys are entered in the
in-app Settings and kept locally (the server only ever returns a masked hint).

## Production build without compose

```bash
npm ci && npm run build                      # dist/ with .br/.gz siblings
cd backend/Versatile.Api && dotnet publish -c Release -o ./publish
```

Serve `dist/` from any static host and run the API on a .NET host, with a
reverse proxy routing `/api/`, `/hubs/` (WebSocket upgrade) and `/health`
to it — `nginx.conf` is the reference. When the SPA and API are on different
origins, set `Cors__AllowedOrigins__0`. Use a managed PostgreSQL 16 and a
managed Redis; run migrations either on boot (default) or with
`dotnet ef database update` against `ConnectionStrings__DefaultConnection`.

## CI/CD

`.github/workflows/ci.yml` — pushes to `master`, `develop`, `feature/*`; PRs
to `master`/`develop`; Node 22.x:

| Job          | Steps                                                                 |
| ------------ | --------------------------------------------------------------------- |
| `lint`       | `npm run lint`, `npm run typecheck`, `npm run lint:tokens` + `npm run policy`, Prettier check, ESLint JSON report |
| `test`       | `npm run test:coverage` (the suite, once), `npm run build`, Codecov   |
| `e2e`        | Playwright (Chromium) with report artifact; runs after `lint`         |
| `backend`    | `dotnet restore/build/test backend/Versatile.slnx`                    |

`.github/workflows/backend-ci.yml` — on pushes and PRs to `master` that touch
`backend/**` (or the workflow itself): build + test,
and on `master` pushes the API image to
`ghcr.io/yosrikhiari/versatile/versatile-api` tagged `latest` and by commit sha
(GHCR requires the lowercase repository name).

SonarCloud was removed from both workflows on 2026-09-15: the stored token
had been rejected (403) for months and the scan added nothing the gate
(lint, typecheck, tests, build) does not already enforce. The `SONAR_TOKEN`
secret can be deleted from the repository settings.

`npm ci` on the runner needs every lock entry Linux resolves. A Windows
`npm install` prunes the optional peers `@emnapi/core` / `@emnapi/runtime`
(behind `@napi-rs/wasm-runtime`), which broke every run from `e916785b` to
`e97b6d1c`; both are pinned as devDependencies so the lock always carries
them.

Also present: `eval-regression.yml`, `deps-audit.yml`, `stale.yml`,
`branch-cleanup.yml`. `chromatic.yml` (Storybook visual regression) exists
locally but is gitignored until a `CHROMATIC_PROJECT_TOKEN` secret exists, so
it does not run in CI.

## Post-deployment checklist

- [ ] SPA loads; `/health` returns 200 through the proxy
- [ ] No CORS errors (same-origin proxy, or `Cors__AllowedOrigins` set)
- [ ] EF migrations applied; connection string uses production credentials
- [ ] Register/login work; protected endpoints return 401 without a token
- [ ] `/hubs/generation` and `/hubs/collaboration` upgrade to WebSocket (`?access_token=` is accepted only on `/hubs/*`)
- [ ] `JWT_KEY` and `ENCRYPTION_MASTER_KEY` are unique and stored in the platform's secret manager
- [ ] `ASPNETCORE_ENVIRONMENT=Production`; the SPA is a production build (no demo-account seed)
- [ ] `/assets/` served immutable; `index.html` `no-cache`
- [ ] Rate limits observed: 100 req/min per client IP, 20 req/min embedding → 429 (in-process limiter, so each API replica counts separately)
- [ ] Logs (Serilog) captured; Redis reachable (the response cache fails open, so an outage only shows as slower reads and log warnings)

## Frontend compression notes

The Vite build pre-compresses every asset over 1 KB to Brotli and gzip
(`vite-plugin-compression`), keeping the originals. nginx serves `.gz`
via `gzip_static on;` (in `nginx.conf`); Brotli static needs the
`ngx_brotli` module — add `brotli_static on;` when the image ships it. CDNs
should serve pre-compressed files and forward `Accept-Encoding` rather than
re-compressing.
