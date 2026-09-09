# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries cover work
done after `v1.0`; each references the commit whose message records how it
was verified.

## [Unreleased]

### Security
- Close the open Mistral embedding relay behind `[Authorize]` plus a
  dedicated 20/min limiter (`24773d6`, verified live: anonymous embedding
  calls return 401). (The companion Hangfire-dashboard lock from that change
  is gone with upstream's later Hangfire removal — no dashboard exists.)
- Stop returning plaintext API keys: `GET /api/apikeys/{provider}` returns a
  masked hint only; the SPA falls back to its local copy (`24773d6`).
- JWTs from query strings accepted only for SignalR hubs; generic 500
  details; per-user cache keys (`24773d6`).
- Add a DOMPurify-backed `sanitizeHtml` util so the first future `v-html`
  sink has a safe path; no raw-HTML sinks exist today (`aa97023`, 5 tests).

### Added
- Chapter-gate warnings (all warn-only, never discard prose): malformed and
  CJK-token scan (`035314a`, `63d4f99`), cross-scene narrative-tense
  consistency (`0f566c0`), scene-payoff coverage (`440d22e`). Each proven
  against real Ollama samples, not just fixtures.
- `tools/generate-sample.mjs`: real-model sample generation plus critic,
  gates and chapter acceptance in one command.
- `TESTING.md`: contributor guide to every suite and its conventions.
- SonarCloud C# scanning and opencover collection in backend CI
  (`a372b17`; first master run confirms the upload).

### Changed
- Frontend decomposition: single-utility homes, batched IndexedDB loads,
  coalesced Dexie writes, extracted graph persistence, run mechanics and
  eval bootstrap (`9c3c0e4`…`c37914b`).
- Toolchain: ESLint 8→10 with flat config (`4ddadc7`), Vitest 1→5
  (`9e7cba9`), Dexie 3→4 (`df7592a`), TipTap 2→3 (`bbd9732`),
  VueUse 10→14 (`2a8e802`), jsdom 24→30 (`aade527`), Vite 8.2.2
  (`364d1bd`). Each verified green or rolled back; none required any.
- `docker compose` runs the full stack (api, redis, nginx proxy, optional
  ollama profile); backend migrations run in-container (`25a812e`).
- Retry-backoff tests use fake timers; `testTimeout` tightened 30s→15s on
  measured evidence (`0af3631`).
- Live-Ollama consistency test gated behind `OLLAMA_LIVE_TESTS=1`
  (`95bb53c`); reachability never meant reliable.

### Fixed
- Antiforgery misconfiguration that 500'd every mutating endpoint
  (pre-existing; found live during Phase 1).
- Sync transport re-POSTing duplicates after a crash between POST and local
  write; re-push now PUT-updates the known record (`d26d42d`).
- Demo account (`test`/`test123`, advertised in the UI) could never log in;
  seeds in dev/test only, never production builds (`468ed22`).
- Missing seam-disconnect rules, metadata-chunking exports and guardrail
  kind registration that 18 tests were written for
  (`2338961`, `a7e6c51`, `e3c097d`). Full suite (`95bb53c`): 2786 pass,
  1 intentional skip, zero failures; `tsc` zero errors.

## [v1.0] and earlier

See `git log v1.0` and earlier history. Entries above start where
systematic verification started; older history is uncurated.
