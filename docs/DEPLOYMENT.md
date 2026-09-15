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
health checks.

### 2. Backend

```bash
cd backend/Versatile.Api
dotnet run
```

Listens on `http://localhost:5171` (`launchSettings.json`). On start it
applies EF migrations (skipped only in the `Testing` environment), exposes
`/health`, and Swagger at `/swagger` in Development. Configuration comes from
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
| `redis`    | `redis:7-alpine`           | —           | default    | volume `redisdata`; cache + rate limits                               |
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
| `ENCRYPTION_MASTER_KEY` | `Encryption__MasterKey` | Encrypts stored per-user API keys |

### Optional

| Variable            | Maps to                                 | Default                          | Description                                                 |
| ------------------- | --------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `POSTGRES_DB/USER/PASSWORD` | `ConnectionStrings__DefaultConnection` | `versatile` / `postgres` / `postgres` | Override the password in production                  |
| `JWT_ISSUER`        | `Jwt__Issuer`                           | `Versatile.Api`                  |                                                             |
| `JWT_AUDIENCE`      | `Jwt__Audience`                         | `Versatile.App`                  |                                                             |
| `OPENAI_API_KEY`    | `Ai__OpenAi__ApiKey`                    | inert placeholder                | Server-side fallback; users normally store their own keys via the API. An **empty string** trips the DI guard — leave unset instead |
| `MISTRAL_API_KEY`   | `Ai__MistralKey`                        | —                                | Server-proxied embeddings (`POST /api/embedding/mistral`)   |
| `OLLAMA_BASE_URL`   | `Ai__Ollama__BaseUrl`                   | `http://ollama:11434`            | Resolves inside compose when the `ollama` profile is active |
| `Cors__AllowedOrigins__0` | —                                 | —                                | Only when the API is reached cross-origin; compose is same-origin |
| `ConnectionStrings__Redis` | —                                | `redis:6379` in compose          |                                                             |
| `ASPNETCORE_ENVIRONMENT`   | —                                | `Production` in the image        | `Testing` disables migrations-on-boot and secure cookies    |

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
| `lint`       | `npm run lint`, `npm run typecheck`, Prettier check, ESLint JSON report |
| `test`       | `npm run test:run`, `npm run test:coverage`, `npm run build`, Codecov |
| `e2e`        | Playwright (Chromium) with report artifact                            |
| `sonarcloud` | SonarCloud scan of the frontend                                       |
| `backend`    | `dotnet restore/build/test backend/Versatile.slnx`                    |

`.github/workflows/backend-ci.yml` — on `backend/**` changes: build + test
with opencover coverage under `dotnet-sonarscanner`, and on `master` pushes
the API image to `ghcr.io/<repo>/versatile-api:latest`. Sonar steps in both
workflows are advisory; a rejected `SONAR_TOKEN` (403) no longer fails the
build or blocks the image.

Also present: `chromatic.yml` (Storybook visual regression),
`eval-regression.yml`, `deps-audit.yml`, `stale.yml`, `branch-cleanup.yml`.

## Post-deployment checklist

- [ ] SPA loads; `/health` returns 200 through the proxy
- [ ] No CORS errors (same-origin proxy, or `Cors__AllowedOrigins` set)
- [ ] EF migrations applied; connection string uses production credentials
- [ ] Register/login work; protected endpoints return 401 without a token
- [ ] `/hubs/generation` and `/hubs/collaboration` upgrade to WebSocket (`?access_token=` is accepted only on `/hubs/*`)
- [ ] `JWT_KEY` and `ENCRYPTION_MASTER_KEY` are unique and stored in the platform's secret manager
- [ ] `ASPNETCORE_ENVIRONMENT=Production`; the SPA is a production build (no demo-account seed)
- [ ] `/assets/` served immutable; `index.html` `no-cache`
- [ ] Rate limits observed: 100 req/min global, 20 req/min embedding → 429
- [ ] Logs (Serilog) captured; Redis reachable (rate limits fail closed where safe)

## Frontend compression notes

The Vite build pre-compresses every asset over 1 KB to Brotli and gzip
(`vite-plugin-compression`), keeping the originals. nginx serves `.gz`
via `gzip_static on;` (in `nginx.conf`); Brotli static needs the
`ngx_brotli` module — add `brotli_static on;` when the image ships it. CDNs
should serve pre-compressed files and forward `Accept-Encoding` rather than
re-compressing.
