# API Guide

Base URL is same-origin `/api` in production (nginx proxies `/api/`,
`/hubs/` and `/health` to the backend). In development the Vite proxy
forwards to the API port (see `vite.config.js`). Interactive reference:
`/swagger` in Development builds only.

The endpoint table at the bottom is generated from the controller
`[Route]` and `[Http*]` attributes (register/login/refresh, the antiforgery
token and `/health` are anonymous; everything else requires auth). For
request/response shapes, Swagger is authoritative — this file documents the
conventions that hold across all controllers.

## Auth

- `POST /api/Auth/register`, `/login`, `/refresh` are the only anonymous
  endpoints (plus `GET /api/antiforgery/token` and `GET /health`).
  `GET /api/Auth/me`, `POST /api/Auth/switch-org` (body `{ organizationId }`,
  returns a new token for that org) and `POST /api/Auth/logout` need auth.
- Send the JWT as `Authorization: Bearer <token>`; register, login, refresh
  and switch-org also set `HttpOnly`, `SameSite=Strict` cookies
  (`access_token` on `/`, `refresh_token` on `/api/auth`), `Secure` everywhere
  except the Development environment. The API reads the `access_token`
  cookie when no header is sent.
- SignalR hubs (`/hubs/collaboration`, `/hubs/generation`) accept the token
  via `?access_token=` because WebSockets cannot set headers (the cookie
  also works). Query-string tokens are accepted **only** on `/hubs/*`
  (hardened in `24773d6`).
- Access tokens live 24 hours; `POST /api/Auth/refresh` (body
  `{ refreshToken }`) rotates them using the 7-day refresh token.

## Tenancy

Nearly every resource is organization-scoped: requests resolve the active
organization from the token's `org_id` claim, and every controller marked
"auth + org" below returns 403 when the token carries no active org
(`RequireOrganizationAttribute`). Registration creates a personal workspace
organization with the new user as admin, so the first token already carries
an `org_id` (before 2026-10-04 a new account had none and got 403 on every
story endpoint). Organization, ApiKeys and Embedding work
without one (invite flow:
`POST /api/Organization/{id}/invite`, remove:
`DELETE /api/Organization/{id}/members/{userId}`). Reading an org you
don't belong to returns 403 — the membership check runs before the
existence check, so it reveals nothing to probe (verified live).

## Conventions

- Success bodies are `ApiResponse<T>` (`{ data, message }`); errors are
  RFC 7807 problem details. 500s are intentionally generic — details go to
  server logs only (`24773d6`).
- List endpoints accept `PagedRequest` (`page`, `pageSize`, capped at 100)
  and return `PagedResponse<T>`; several support `afterId` cursor
  pagination for sync-style polling.
- Rate limits: 100 req/min globally per client IP, plus 20 req/min on the
  embedding proxy (one fixed window shared by all callers). Exceeding
  returns 429 with `Retry-After` (seconds until the window resets); the
  client's sync waits it out.
- GETs marked cacheable are served from Redis for 60 to 300 seconds. Any
  successful write retires the cached reads of its organization (keys carry
  a per-org generation that each write bumps), so a read after a write is
  never stale. The filter is off in the `Testing` environment.
- Chapter and scene links: `Section` takes `volumeId`, `branchId` and
  `order`; `Subsection` takes `branchId`, `order` and, on update,
  `sectionId` (move to another chapter of the same story). On update `null`
  leaves a link as it is and the empty GUID clears it; a link to a row of
  another story is a 404.
- No antiforgery tokens are required: cookie auth is an SPA convenience,
  not the trust boundary; JWT + org scoping is. (Deliberate decision after
  the global filter 500'd every mutating endpoint — see Phase 1 notes.)
- AI provider keys never leave the server: `GET /api/ApiKeys/{provider}`
  returns a masked hint; the Mistral embedding call is proxied through
  `POST /api/embedding/mistral`. The SPA keeps its own local copy of keys
  for direct browser-side provider calls.

## Endpoint inventory

Most resources are nested under their story (`/api/story/{storyId}/...`);
scenes are nested under their chapter. `SessionArchiveItem` has no
`{storyId}` in its route, so its `storyId` binds from the query string
(`?storyId=`). Routes are case-insensitive.

SignalR hubs (both `[Authorize]`): `/hubs/collaboration`
(`JoinStoryGroup`, `LeaveStoryGroup`, `CursorMoved`, `ContentChanged`) and
`/hubs/generation` (`JoinStoryGroup`, `LeaveStoryGroup`,
`GenerateContinuation`, `GenerateSuggestion`, `GenerateCharacterProfile`,
`GenerateStream`, `TestConnection`, `ListModels`).

| Controller | Auth | Endpoint |
|---|---|---|
| Annotation | auth + org | `GET /api/story/{storyId}/annotation` |
| | | `GET /api/story/{storyId}/annotation/{id}` |
| | | `POST /api/story/{storyId}/annotation` |
| | | `PUT /api/story/{storyId}/annotation/{id}` |
| | | `DELETE /api/story/{storyId}/annotation/{id}` |
| Antiforgery | anon | `GET /api/antiforgery/token` |
| ApiKeys | auth (no active org needed) | `POST /api/ApiKeys/test` |
| | | `POST /api/ApiKeys/{provider}/models` |
| | | `GET /api/ApiKeys/{provider}` |
| | | `PUT /api/ApiKeys/{provider}` |
| | | `DELETE /api/ApiKeys/{provider}` |
| Auth | register/login/refresh anon; me/switch-org/logout auth | `POST /api/Auth/register` |
| | | `POST /api/Auth/login` |
| | | `POST /api/Auth/refresh` |
| | | `GET /api/Auth/me` |
| | | `POST /api/Auth/switch-org` |
| | | `POST /api/Auth/logout` |
| AuthorProfile | auth + org | `GET /api/story/{storyId}/author-profile` |
| | | `GET /api/story/{storyId}/author-profile/{id}` |
| | | `POST /api/story/{storyId}/author-profile` |
| | | `PUT /api/story/{storyId}/author-profile/{id}` |
| | | `DELETE /api/story/{storyId}/author-profile/{id}` |
| Branch | auth + org | `GET /api/story/{storyId}/branch` |
| | | `GET /api/story/{storyId}/branch/{id}` |
| | | `POST /api/story/{storyId}/branch` |
| | | `PUT /api/story/{storyId}/branch/{id}` |
| | | `DELETE /api/story/{storyId}/branch/{id}` |
| Bible | auth + org | `GET /api/story/{storyId}/bible` |
| | | `GET /api/story/{storyId}/bible/{id}` |
| | | `POST /api/story/{storyId}/bible` |
| | | `PUT /api/story/{storyId}/bible/{id}` |
| | | `DELETE /api/story/{storyId}/bible/{id}` |
| Chapter | auth + org | `GET /api/story/{storyId}/chapter` |
| | | `GET /api/story/{storyId}/chapter/{id}` |
| | | `POST /api/story/{storyId}/chapter` |
| | | `PUT /api/story/{storyId}/chapter/{id}` |
| | | `DELETE /api/story/{storyId}/chapter/{id}` |
| CharacterRelationship | auth + org | `GET /api/story/{storyId}/character-relationship` |
| | | `GET /api/story/{storyId}/character-relationship/{id}` |
| | | `POST /api/story/{storyId}/character-relationship` |
| | | `PUT /api/story/{storyId}/character-relationship/{id}` |
| | | `DELETE /api/story/{storyId}/character-relationship/{id}` |
| DailyGoal | auth + org | `GET /api/story/{storyId}/daily-goal` |
| | | `GET /api/story/{storyId}/daily-goal/{id}` |
| | | `POST /api/story/{storyId}/daily-goal` |
| | | `PUT /api/story/{storyId}/daily-goal/{id}` |
| | | `DELETE /api/story/{storyId}/daily-goal/{id}` |
| Embedding | auth (no active org needed), `embedding` rate limit | `POST /api/embedding/mistral` |
| Entity | auth + org | `GET /api/story/{storyId}/entity` |
| | | `GET /api/story/{storyId}/entity/{id}` |
| | | `POST /api/story/{storyId}/entity` |
| | | `PUT /api/story/{storyId}/entity/{id}` |
| | | `DELETE /api/story/{storyId}/entity/{id}` |
| Flow | auth + org | `GET /api/story/{storyId}/flow` |
| | | `PUT /api/story/{storyId}/flow` |
| GeneratedStory | auth + org | `GET /api/story/{storyId}/generated-story` |
| | | `GET /api/story/{storyId}/generated-story/{id}` |
| | | `POST /api/story/{storyId}/generated-story` |
| | | `PUT /api/story/{storyId}/generated-story/{id}` |
| | | `DELETE /api/story/{storyId}/generated-story/{id}` |
| GraphEdge | auth + org | `GET /api/story/{storyId}/graph-edge` |
| | | `GET /api/story/{storyId}/graph-edge/{id}` |
| | | `POST /api/story/{storyId}/graph-edge` |
| | | `PUT /api/story/{storyId}/graph-edge/{id}` |
| | | `DELETE /api/story/{storyId}/graph-edge/{id}` |
| GraphGroup | auth + org | `GET /api/story/{storyId}/graph-group` |
| | | `GET /api/story/{storyId}/graph-group/{id}` |
| | | `POST /api/story/{storyId}/graph-group` |
| | | `PUT /api/story/{storyId}/graph-group/{id}` |
| | | `DELETE /api/story/{storyId}/graph-group/{id}` |
| GroupEdge | auth + org | `GET /api/story/{storyId}/group-graph-edge` |
| | | `GET /api/story/{storyId}/group-graph-edge/{id}` |
| | | `POST /api/story/{storyId}/group-graph-edge` |
| | | `PUT /api/story/{storyId}/group-graph-edge/{id}` |
| | | `DELETE /api/story/{storyId}/group-graph-edge/{id}` |
| Manuscript | auth + org | `GET /api/story/{storyId}/manuscript` |
| | | `GET /api/story/{storyId}/manuscript/{id}` |
| | | `POST /api/story/{storyId}/manuscript` |
| | | `PUT /api/story/{storyId}/manuscript/{id}` |
| | | `DELETE /api/story/{storyId}/manuscript/{id}` |
| NodePosition | auth + org | `GET /api/story/{storyId}/node-position` |
| | | `GET /api/story/{storyId}/node-position/{id}` |
| | | `POST /api/story/{storyId}/node-position` |
| | | `PUT /api/story/{storyId}/node-position/{id}` |
| | | `DELETE /api/story/{storyId}/node-position/{id}` |
| Organization | auth (no active org needed) | `GET /api/Organization` |
| | | `GET /api/Organization/{id}` |
| | | `POST /api/Organization` |
| | | `PUT /api/Organization/{id}` |
| | | `DELETE /api/Organization/{id}` |
| | | `POST /api/Organization/{id}/invite` |
| | | `DELETE /api/Organization/{id}/members/{userId}` |
| PlotThread | auth + org | `GET /api/story/{storyId}/plot-thread` |
| | | `GET /api/story/{storyId}/plot-thread/{id}` |
| | | `POST /api/story/{storyId}/plot-thread` |
| | | `PUT /api/story/{storyId}/plot-thread/{id}` |
| | | `DELETE /api/story/{storyId}/plot-thread/{id}` |
| ResearchChunk | auth + org | `GET /api/story/{storyId}/research-chunk` |
| | | `GET /api/story/{storyId}/research-chunk/{id}` |
| | | `POST /api/story/{storyId}/research-chunk` |
| | | `PUT /api/story/{storyId}/research-chunk/{id}` |
| | | `DELETE /api/story/{storyId}/research-chunk/{id}` |
| ResearchDocument | auth + org | `GET /api/story/{storyId}/research-document` |
| | | `GET /api/story/{storyId}/research-document/{id}` |
| | | `POST /api/story/{storyId}/research-document` |
| | | `PUT /api/story/{storyId}/research-document/{id}` |
| | | `DELETE /api/story/{storyId}/research-document/{id}` |
| | | `POST /api/story/{storyId}/research-document/fetch-url` |
| ResearchTag | auth + org | `GET /api/story/{storyId}/research-tag` |
| | | `GET /api/story/{storyId}/research-tag/{id}` |
| | | `POST /api/story/{storyId}/research-tag` |
| | | `PUT /api/story/{storyId}/research-tag/{id}` |
| | | `DELETE /api/story/{storyId}/research-tag/{id}` |
| RevisionComment | auth + org | `GET /api/story/{storyId}/revision-comment` |
| | | `GET /api/story/{storyId}/revision-comment/{id}` |
| | | `POST /api/story/{storyId}/revision-comment` |
| | | `PUT /api/story/{storyId}/revision-comment/{id}` |
| | | `DELETE /api/story/{storyId}/revision-comment/{id}` |
| Scene | auth + org | `GET /api/chapter/{chapterId}/scene` |
| | | `GET /api/chapter/{chapterId}/scene/{id}` |
| | | `POST /api/chapter/{chapterId}/scene` |
| | | `PUT /api/chapter/{chapterId}/scene/{id}` |
| | | `DELETE /api/chapter/{chapterId}/scene/{id}` |
| Section | auth + org | `GET /api/story/{storyId}/section` |
| | | `GET /api/story/{storyId}/section/{id}` |
| | | `POST /api/story/{storyId}/section` |
| | | `PUT /api/story/{storyId}/section/{id}` |
| | | `DELETE /api/story/{storyId}/section/{id}` |
| SessionArchiveItem | auth + org | `GET /api/story/{storyId}/session-archive-item` |
| | | `GET /api/story/{storyId}/session-archive-item/{id}` |
| | | `POST /api/story/{storyId}/session-archive-item` |
| | | `PUT /api/story/{storyId}/session-archive-item/{id}` |
| | | `DELETE /api/story/{storyId}/session-archive-item/{id}` |
| Snapshot | auth + org | `GET /api/story/{storyId}/snapshot` |
| | | `GET /api/story/{storyId}/snapshot/{id}` |
| | | `POST /api/story/{storyId}/snapshot` |
| | | `PUT /api/story/{storyId}/snapshot/{id}` |
| | | `DELETE /api/story/{storyId}/snapshot/{id}` |
| Snippet | auth + org | `GET /api/story/{storyId}/snippet` |
| | | `GET /api/story/{storyId}/snippet/{id}` |
| | | `POST /api/story/{storyId}/snippet` |
| | | `PUT /api/story/{storyId}/snippet/{id}` |
| | | `DELETE /api/story/{storyId}/snippet/{id}` |
| SparkHistoryItem | auth + org | `GET /api/story/{storyId}/spark-history-item` |
| | | `GET /api/story/{storyId}/spark-history-item/{id}` |
| | | `POST /api/story/{storyId}/spark-history-item` |
| | | `PUT /api/story/{storyId}/spark-history-item/{id}` |
| | | `DELETE /api/story/{storyId}/spark-history-item/{id}` |
| Story | auth + org | `GET /api/Story` |
| | | `GET /api/Story/{id}` |
| | | `POST /api/Story` |
| | | `PUT /api/Story/{id}` |
| | | `DELETE /api/Story/{id}` |
| StoryDocument | auth + org | `GET /api/story/{storyId}/story-document` |
| | | `GET /api/story/{storyId}/story-document/{id}` |
| | | `POST /api/story/{storyId}/story-document` |
| | | `PUT /api/story/{storyId}/story-document/{id}` |
| | | `DELETE /api/story/{storyId}/story-document/{id}` |
| StoryElement | auth + org | `GET /api/story/{storyId}/story-element` |
| | | `GET /api/story/{storyId}/story-element/{id}` |
| | | `POST /api/story/{storyId}/story-element` |
| | | `PUT /api/story/{storyId}/story-element/{id}` |
| | | `DELETE /api/story/{storyId}/story-element/{id}` |
| StoryStateSnapshot | auth + org | `GET /api/story/{storyId}/story-state-snapshot` |
| | | `GET /api/story/{storyId}/story-state-snapshot/{id}` |
| | | `POST /api/story/{storyId}/story-state-snapshot` |
| | | `PUT /api/story/{storyId}/story-state-snapshot/{id}` |
| | | `DELETE /api/story/{storyId}/story-state-snapshot/{id}` |
| Subsection | auth + org | `GET /api/story/{storyId}/subsection` |
| | | `GET /api/story/{storyId}/subsection/{id}` |
| | | `POST /api/story/{storyId}/subsection` |
| | | `PUT /api/story/{storyId}/subsection/{id}` |
| | | `DELETE /api/story/{storyId}/subsection/{id}` |
| VoiceProfile | auth + org | `GET /api/story/{storyId}/voice-profile` |
| | | `GET /api/story/{storyId}/voice-profile/{id}` |
| | | `POST /api/story/{storyId}/voice-profile` |
| | | `PUT /api/story/{storyId}/voice-profile/{id}` |
| | | `DELETE /api/story/{storyId}/voice-profile/{id}` |
| Volume | auth + org | `GET /api/story/{storyId}/volume` |
| | | `GET /api/story/{storyId}/volume/{id}` |
| | | `POST /api/story/{storyId}/volume` |
| | | `PUT /api/story/{storyId}/volume/{id}` |
| | | `DELETE /api/story/{storyId}/volume/{id}` |
| VolumeEntity | auth + org | `GET /api/story/{storyId}/volume-entity` |
| | | `GET /api/story/{storyId}/volume-entity/{id}` |
| | | `POST /api/story/{storyId}/volume-entity` |
| | | `PUT /api/story/{storyId}/volume-entity/{id}` |
| | | `DELETE /api/story/{storyId}/volume-entity/{id}` |
