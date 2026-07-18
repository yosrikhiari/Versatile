# NOTES

> Preferences and context from teaching sessions. Update only when the user expresses a clear change.

## Learner Preferences

- **Role:** Owner/architect scaling Versatile from single-user app to multi-tenant SaaS
- **Goal:** Understand the 7 multi-tenant gaps, the 4-phase roadmap, and drive implementation phase by phase
- **Learning style:** Hands-on, code-first — exercises that involve opening files and tracing code paths are preferred
- **Focus trajectory:** Architecture (lessons 1-3) → Multi-tenant SaaS transformation (lesson 4+)

## Session Log

- **2026-07-17:** Lesson 1 (Five Patterns of Scalability), Lesson 2 (Carving Monoliths). User chose "Developer Scalability" as next focus after Lesson 1. Identified 1767-line `useVolumeStoryGenerator.js` as primary teaching vehicle.
- **2026-07-18:** Lesson 3 (Idempotency Keys). Mission shifted to multi-tenant SaaS transformation. User asked to be taught the concepts instead of jumping into Phase 1 implementation.
- **2026-07-18 (later):** Lesson 4 (Multi-Tenancy Fundamentals) — walked through all 7 gaps in the codebase. Deep dive on Organization entity + ripple effect.
- **2026-07-18 (evening):** Lesson 5 (Backend Controller Patterns) — analyzed all 5 controllers, mapped middleware stack, DI registration, auth flow. Identified 5 issues: dual error middleware, auth inconsistency in SceneController, DI split, no repository abstraction, missing OpenAPI metadata. User building comprehensive mental model before starting Phase 1 implementation.
