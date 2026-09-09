# API Guide

Base URL is same-origin `/api` in production (nginx proxies `/api/`,
`/hubs/` and `/health` to the backend). In development the Vite proxy
forwards to the API port (see `vite.config.ts`). Interactive reference:
`/swagger` in Development builds only.

The endpoint table at the bottom is generated from controller sources
(`AllowAnonymous` register/login/refresh excepted, everything requires
auth). For request/response shapes, Swagger is authoritative — this file
documents the conventions that hold across all controllers.

## Auth

- `POST /api/Auth/register`, `/login`, `/refresh` are the only anonymous
  endpoints (plus `GET /api/antiforgery/token`).
- Send the JWT as `Authorization: Bearer <token>`; login also sets a
  `Secure`, `HttpOnly` cookie usable by the SPA.
- SignalR hubs (`/hubs/collaboration`, `/hubs/generation`) accept the token
  via `?access_token=` because WebSockets cannot set headers. Query-string
  tokens are accepted **only** on `/hubs/*` (hardened in `24773d6`).
- Access tokens live 24 hours; `POST /api/Auth/refresh` rotates them using
  the 7-day refresh token.

## Tenancy

Nearly every resource is organization-scoped: requests resolve the active
organization from the user's claims (invite flow:
`POST /api/Organization/{id}/invite`, remove:
`DELETE /api/Organization/{id}/members/{userId}`). Cross-org access
returns 404, not 403, so membership cannot be probed.

## Conventions

- Success bodies are `ApiResponse<T>` (`{ data, message }`); errors are
  RFC 7807 problem details. 500s are intentionally generic — details go to
  server logs only (`24773d6`).
- List endpoints accept `PagedRequest` (`page`, `pageSize`, capped at 100)
  and return `PagedResponse<T>`; several support `afterId` cursor
  pagination for sync-style polling.
- Rate limits: 100 req/min globally per client, 20 req/min on the
  embedding proxy. Exceeding returns 429.
- No antiforgery tokens are required: cookie auth is an SPA convenience,
  not the trust boundary; JWT + org scoping is. (Deliberate decision after
  the global filter 500'd every mutating endpoint — see Phase 1 notes.)
- AI provider keys never leave the server: `GET /api/ApiKeys/{provider}`
  returns a masked hint; the Mistral embedding call is proxied through
  `POST /api/embedding/mistral`. The SPA keeps its own local copy of keys
  for direct browser-side provider calls.

## Endpoint inventory

| Controller | Auth | Endpoints |
|---|---|---|
| Annotation | auth |
| | `GET /api/Annotation` |
| | `GET /api/Annotation/{id}` |
| | `POST /api/Annotation` |
| | `PUT /api/Annotation/{id}` |
| | `DELETE /api/Annotation/{id}` |
| Antiforgery | anon |
| | `GET /api/antiforgery/token` |
| ApiKeys | auth |
| | `POST /api/ApiKeys/test` |
| | `POST /api/ApiKeys/{provider}/models` |
| | `GET /api/ApiKeys/{provider}` |
| | `PUT /api/ApiKeys/{provider}` |
| | `DELETE /api/ApiKeys/{provider}` |
| Auth | auth (register/login/refresh allow anonymous) |
| | `POST /api/Auth/register` |
| | `POST /api/Auth/login` |
| | `POST /api/Auth/refresh` |
| AuthorProfile | auth |
| | `GET /api/AuthorProfile` |
| | `GET /api/AuthorProfile/{id}` |
| | `POST /api/AuthorProfile` |
| | `PUT /api/AuthorProfile/{id}` |
| | `DELETE /api/AuthorProfile/{id}` |
| Bible | auth |
| | `POST /api/Bible` |
| | `PUT /api/Bible/{id}` |
| | `DELETE /api/Bible/{id}` |
| Chapter | auth |
| | `POST /api/Chapter` |
| | `PUT /api/Chapter/{id}` |
| | `DELETE /api/Chapter/{id}` |
| CharacterRelationship | auth |
| | `POST /api/CharacterRelationship` |
| | `PUT /api/CharacterRelationship/{id}` |
| | `DELETE /api/CharacterRelationship/{id}` |
| DailyGoal | auth |
| | `GET /api/DailyGoal` |
| | `GET /api/DailyGoal/{id}` |
| | `POST /api/DailyGoal` |
| | `PUT /api/DailyGoal/{id}` |
| | `DELETE /api/DailyGoal/{id}` |
| Embedding | auth |
| | `POST /api/embedding/mistral` |
| Entity | auth |
| | `POST /api/Entity` |
| | `PUT /api/Entity/{id}` |
| | `DELETE /api/Entity/{id}` |
| Flow | auth |
| | `PUT /api/Flow` |
| GeneratedStory | auth |
| | `GET /api/GeneratedStory` |
| | `GET /api/GeneratedStory/{id}` |
| | `POST /api/GeneratedStory` |
| | `PUT /api/GeneratedStory/{id}` |
| | `DELETE /api/GeneratedStory/{id}` |
| GraphEdge | auth |
| | `GET /api/GraphEdge` |
| | `GET /api/GraphEdge/{id}` |
| | `POST /api/GraphEdge` |
| | `PUT /api/GraphEdge/{id}` |
| | `DELETE /api/GraphEdge/{id}` |
| GraphGroup | auth |
| | `GET /api/GraphGroup` |
| | `GET /api/GraphGroup/{id}` |
| | `POST /api/GraphGroup` |
| | `PUT /api/GraphGroup/{id}` |
| | `DELETE /api/GraphGroup/{id}` |
| GroupEdge | auth |
| | `GET /api/GroupEdge` |
| | `GET /api/GroupEdge/{id}` |
| | `POST /api/GroupEdge` |
| | `PUT /api/GroupEdge/{id}` |
| | `DELETE /api/GroupEdge/{id}` |
| Manuscript | auth |
| | `POST /api/Manuscript` |
| | `PUT /api/Manuscript/{id}` |
| | `DELETE /api/Manuscript/{id}` |
| NodePosition | auth |
| | `GET /api/NodePosition` |
| | `GET /api/NodePosition/{id}` |
| | `POST /api/NodePosition` |
| | `PUT /api/NodePosition/{id}` |
| | `DELETE /api/NodePosition/{id}` |
| Organization | auth |
| | `POST /api/Organization` |
| | `PUT /api/Organization/{id}` |
| | `DELETE /api/Organization/{id}` |
| | `POST /api/Organization/{id}/invite` |
| | `DELETE /api/Organization/{id}/members/{userId}` |
| PlotThread | auth |
| | `POST /api/PlotThread` |
| | `PUT /api/PlotThread/{id}` |
| | `DELETE /api/PlotThread/{id}` |
| ResearchChunk | auth |
| | `GET /api/ResearchChunk` |
| | `GET /api/ResearchChunk/{id}` |
| | `POST /api/ResearchChunk` |
| | `PUT /api/ResearchChunk/{id}` |
| | `DELETE /api/ResearchChunk/{id}` |
| ResearchDocument | auth |
| | `GET /api/ResearchDocument` |
| | `POST /api/ResearchDocument` |
| | `PUT /api/ResearchDocument/{id}` |
| | `DELETE /api/ResearchDocument/{id}` |
| | `POST /api/ResearchDocument/fetch-url` |
| ResearchTag | auth |
| | `POST /api/ResearchTag` |
| | `PUT /api/ResearchTag/{id}` |
| | `DELETE /api/ResearchTag/{id}` |
| RevisionComment | auth |
| | `GET /api/RevisionComment` |
| | `GET /api/RevisionComment/{id}` |
| | `POST /api/RevisionComment` |
| | `PUT /api/RevisionComment/{id}` |
| | `DELETE /api/RevisionComment/{id}` |
| Scene | auth |
| | `POST /api/Scene` |
| | `PUT /api/Scene/{id}` |
| | `DELETE /api/Scene/{id}` |
| Section | auth |
| | `POST /api/Section` |
| | `PUT /api/Section/{id}` |
| | `DELETE /api/Section/{id}` |
| SessionArchiveItem | auth |
| | `GET /api/SessionArchiveItem` |
| | `GET /api/SessionArchiveItem/{id}` |
| | `POST /api/SessionArchiveItem` |
| | `PUT /api/SessionArchiveItem/{id}` |
| | `DELETE /api/SessionArchiveItem/{id}` |
| Snapshot | auth |
| | `GET /api/Snapshot` |
| | `GET /api/Snapshot/{id}` |
| | `POST /api/Snapshot` |
| | `PUT /api/Snapshot/{id}` |
| | `DELETE /api/Snapshot/{id}` |
| Snippet | auth |
| | `GET /api/Snippet` |
| | `GET /api/Snippet/{id}` |
| | `POST /api/Snippet` |
| | `PUT /api/Snippet/{id}` |
| | `DELETE /api/Snippet/{id}` |
| SparkHistoryItem | auth |
| | `GET /api/SparkHistoryItem` |
| | `GET /api/SparkHistoryItem/{id}` |
| | `POST /api/SparkHistoryItem` |
| | `PUT /api/SparkHistoryItem/{id}` |
| | `DELETE /api/SparkHistoryItem/{id}` |
| Story | auth |
| | `POST /api/Story` |
| | `PUT /api/Story/{id}` |
| | `DELETE /api/Story/{id}` |
| StoryDocument | auth |
| | `GET /api/StoryDocument` |
| | `GET /api/StoryDocument/{id}` |
| | `POST /api/StoryDocument` |
| | `PUT /api/StoryDocument/{id}` |
| | `DELETE /api/StoryDocument/{id}` |
| StoryElement | auth |
| | `POST /api/StoryElement` |
| | `PUT /api/StoryElement/{id}` |
| | `DELETE /api/StoryElement/{id}` |
| StoryStateSnapshot | auth |
| | `GET /api/StoryStateSnapshot` |
| | `GET /api/StoryStateSnapshot/{id}` |
| | `POST /api/StoryStateSnapshot` |
| | `PUT /api/StoryStateSnapshot/{id}` |
| | `DELETE /api/StoryStateSnapshot/{id}` |
| Subsection | auth |
| | `POST /api/Subsection` |
| | `PUT /api/Subsection/{id}` |
| | `DELETE /api/Subsection/{id}` |
| VoiceProfile | auth |
| | `GET /api/VoiceProfile` |
| | `GET /api/VoiceProfile/{id}` |
| | `POST /api/VoiceProfile` |
| | `PUT /api/VoiceProfile/{id}` |
| | `DELETE /api/VoiceProfile/{id}` |
| Volume | auth |
| | `POST /api/Volume` |
| | `PUT /api/Volume/{id}` |
| | `DELETE /api/Volume/{id}` |
| VolumeEntity | auth |
| | `GET /api/VolumeEntity` |
| | `GET /api/VolumeEntity/{id}` |
| | `POST /api/VolumeEntity` |
| | `PUT /api/VolumeEntity/{id}` |
| | `DELETE /api/VolumeEntity/{id}` |
