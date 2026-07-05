<!-- GSD: auto-generated -->

# Deployment

## Prerequisites

Before deploying, ensure the following tools are installed on your system:

- **Node.js** 18.x or 20.x (match the CI matrix; 20.x recommended for production)
- **npm** 9+ (bundled with Node.js)
- **.NET 10.0 SDK** — required to build and publish the backend API
- **Docker Desktop** (or Docker engine) — required for running PostgreSQL locally via docker-compose
- **Git** — for cloning the repository and triggering CI pipelines

Optional but recommended:

- **PostgreSQL 16** client tools (`psql`) for manual database inspection
- **Azure CLI**, **AWS CLI**, or **Fly CLI** depending on your cloud target

## Local Development Deployment

### 1. Start the database

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container named `versatile-postgres` on port **5432** with credentials `postgres / postgres` and a database named `versatile`. The container includes a health check that waits for `pg_isready` before reporting as healthy.

### 2. Configure environment

Copy or create a `.env` file at the project root. At minimum the following values are required:

```bash
# .env
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgres://versatile:versatile@localhost:5432/versatile?sslmode=disable
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRY_HOURS=720
OLLAMA_ENDPOINT=http://localhost:11434
VITE_MISTRAL_API_KEY=your-mistral-api-key
```

### 3. Run the backend API

```bash
cd backend/Versatile.Api
dotnet run
```

The backend starts on **http://localhost:5171** (as defined in `Properties/launchSettings.json`). On first startup it automatically applies any pending Entity Framework migrations against the PostgreSQL database.

### 4. Run the frontend dev server

Open a second terminal:

```bash
npm install
npm run dev
```

The Vite dev server starts on **http://localhost:5173** and proxies `/api` requests to `http://localhost:5171`.

### 5. Verify

- Open **http://localhost:5173** in a browser
- Confirm the frontend loads and API calls resolve (check browser dev tools Network tab)
- Confirm the backend responds at **http://localhost:5171** (should return a 404 or valid API response)

## Production Build

### Frontend

```bash
npm ci
npm run build
```

The production build outputs static files to the `dist/` directory. These files are ready to be served by any static web server (Nginx, Caddy, CDN, etc.).

Key build configuration (from `vite.config.js`):

| Setting | Value |
|---------|-------|
| Output directory | `dist/` |
| Chunk size warning limit | 2500 kB |
| Dev server port | 5173 |

### Backend

```bash
cd backend/Versatile.Api
dotnet publish -c Release -o ./publish
```

The published output is placed in `backend/Versatile.Api/publish/` and can be deployed as a self-contained .NET application.

## Environment Variables

The following environment variables must be set in the production environment. The backend uses both environment variables and `appsettings.json` — values in environment variables take precedence over the config file.

### Backend (ASP.NET Core)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ConnectionStrings__DefaultConnection` | Yes | — | PostgreSQL connection string (e.g., `Host=db.example.com;Port=5432;Database=versatile;Username=user;Password=pass`) |
| `Jwt__Key` | Yes | — | Symmetric signing key for JWT token generation and validation. Must be a sufficiently long string (32+ characters) |
| `Jwt__Issuer` | No | `Versatile.Api` | JWT issuer claim |
| `Jwt__Audience` | No | `Versatile.App` | JWT audience claim |
| `Ai__ApiKey` | Yes | — | OpenAI-compatible API key used by the chat and AI generation services |
| `Ai__Endpoint` | No | — | Custom OpenAI-compatible endpoint URL. If omitted, the default OpenAI endpoint is used |
| `Ai__Model` | No | `gpt-4o-mini` | The model identifier to use for AI completions |
| `ASPNETCORE_URLS` | No | `http://localhost:5171` | The URL the Kestrel server binds to |

### Frontend (Vite / Build-time)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_MISTRAL_API_KEY` | Yes | — | API key for Mistral AI embedding service. Referenced at build time |

### Docker / Runtime

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Alternative port mapping for containerized deployments |
| `HOST` | No | `0.0.0.0` | Bind address for the server |
| `OLLAMA_ENDPOINT` | No | `http://localhost:11434` | Local Ollama instance endpoint (used during local development) |

## Deploying the Database

### Using docker-compose (single server)

The included `docker-compose.yml` starts PostgreSQL 16 with a persistent volume:

```bash
docker compose up -d
docker compose down      # stop
docker compose down -v   # stop and delete volume
```

In production, replace this with a managed PostgreSQL service such as:

- **Azure Database for PostgreSQL** — Flexible Server
- **AWS RDS for PostgreSQL**
- **DigitalOcean Managed Databases**
- **Railway** or **Fly.io Postgres**
- **Neon Serverless Postgres**

After provisioning the database, run migrations:

```bash
cd backend/Versatile.Api
export ConnectionStrings__DefaultConnection="<production-connection-string>"
dotnet ef database update
```

Or let the application apply them on startup (the app calls `db.Database.Migrate()` in `Program.cs` when it starts).

## CI/CD Pipeline

The project includes a GitHub Actions CI pipeline defined in `.github/workflows/ci.yml`.

### Trigger

The pipeline runs on:

- Push to `master`, `develop`, or `feature/*` branches
- Pull requests targeting `master` or `develop`

### Jobs

**test** — runs on `ubuntu-latest` with a Node.js matrix (18.x and 20.x):

| Step | Description |
|------|-------------|
| `actions/checkout@v4` | Clone repository |
| `actions/setup-node@v4` | Install Node.js with npm cache |
| `npm ci` | Install exact dependencies |
| `npm run lint` | Run ESLint |
| ESLint report | Generate JSON report (Node 20.x only, non-failing) |
| `npm run test:run` | Run Vitest test suite |
| `npm run test:coverage` | Run tests with coverage |
| Upload coverage | Send to Codecov (Node 20.x only) |

**build** — runs on `ubuntu-latest` with Node.js 20.x:

| Step | Description |
|------|-------------|
| `actions/checkout@v4` | Clone repository |
| `actions/setup-node@v4` | Install Node.js 20.x with npm cache |
| `npm ci` | Install exact dependencies |
| `npm run build` | Build frontend to `dist/` |
| Upload artifacts | Upload `dist/` for subsequent deployment jobs |

### Adding backend CI

The current CI pipeline does not include the .NET backend. To add it, extend the `build` job:

```yaml
- name: Setup .NET
  uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '10.0.x'

- name: Publish API
  run: |
    dotnet publish backend/Versatile.Api/Versatile.Api.csproj \
      -c Release \
      -o ./publish-api
```

## Deployment Options

### Option 1: Static hosting + managed backend

Deploy the frontend `dist/` folder to any static host and the backend to a .NET application host.

**Frontend hosts:**

- **Vercel** — connect the Git repository and set root directory; configure `npm run build` as the build command and `dist` as the output directory
- **Netlify** — similar to Vercel; set publish directory to `dist/`
- **Cloudflare Pages** — set build command to `npm run build` and build output to `dist/`
- **AWS S3 + CloudFront** — sync `dist/` to an S3 bucket fronted by CloudFront
- **Azure Static Web Apps** — configure build preset for Vue.js

**Backend hosts:**

- **Azure App Service** — deploy the .NET publish output as a Linux or Windows web app
- **AWS Elastic Beanstalk** — package the publish output as a ZIP and upload
- **Fly.io** — deploy with a Dockerfile (see Option 2)
- **Railway** — connect the Git repository, set start command to `dotnet Versatile.Api.dll`

### Option 2: Docker container deployment

No Dockerfile exists in the project yet. To containerize, create a `Dockerfile` for the backend:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 5171

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/Versatile.Api/Versatile.Api.csproj .
RUN dotnet restore
COPY backend/Versatile.Api/ .
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:5171
ENTRYPOINT ["dotnet", "Versatile.Api.dll"]
```

And for the frontend:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Option 3: docker-compose (full stack)

Extend the existing `docker-compose.yml` to include the frontend and backend services alongside PostgreSQL. This is suitable for staging or single-server production.

## Proxy Configuration

The Vite dev server proxies the following paths to backend services:

| Path | Target | Description |
|------|--------|-------------|
| `/api` | `http://localhost:5171` | Backend ASP.NET API |
| `/ollama` | `http://localhost:11434` | Local Ollama instance |
| `/sdapi` | `http://127.0.0.1:7860` | Stable Diffusion WebUI API |

In production, use a reverse proxy (Nginx, Caddy, or your cloud provider's load balancer) to route `/api` (and optionally `/hub/*` for SignalR WebSocket connections) to the backend.

## Post-Deployment Verification Checklist

After deploying, run through the following checks:

### Connectivity

- [ ] Frontend loads at the expected URL
- [ ] Backend responds at `/api` endpoints
- [ ] No CORS errors in browser console

### Database

- [ ] PostgreSQL container or managed instance is reachable
- [ ] EF Core migrations have run (tables are created)
- [ ] Connection string uses production credentials (not default dev values)

### Authentication

- [ ] Login flow works end-to-end
- [ ] JWT tokens are issued and accepted
- [ ] Protected endpoints return 401 when no token is provided

### Real-time features

- [ ] SignalR hubs (`/hub/generation`, `/hub/collaboration`) accept WebSocket connections
- [ ] Real-time updates flow correctly

### Environment

- [ ] `Jwt__Key` is a strong, unique value (not `dev-secret-change-in-production`)
- [ ] `Ai__ApiKey` is a valid production API key
- [ ] All secrets are stored in the deployment platform's secret manager (not in config files)
- [ ] `ASPNETCORE_ENVIRONMENT` is set to `Production`

### Build artifacts

- [ ] Frontend `dist/` files are served with correct MIME types
- [ ] Static assets have cache-control headers configured
- [ ] Backend publish output is self-contained and runs without SDK

### Monitoring

- [ ] Application logs are captured and searchable
- [ ] Health check endpoint (if added) returns 200 OK
- [ ] Error reporting is configured (if using Sentry, Application Insights, etc.)
