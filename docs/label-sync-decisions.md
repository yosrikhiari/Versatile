# Label sync: decision-required spec (parked)

**Status:** draft/decision-needed. Do not implement sync of human/scene labels until explicit product/privacy/engineering decisions are recorded. Local label storage/workflows exist (e.g., Dexie `sceneLabels`/human-review tables, local-only); **syncing labels is not active**.

## Why parked
Current sync is **LWW, no CRDT/merge/conflict UI, not E2E encrypted**. Label data is sensitive (human judgments, potentially identifying workflow metadata). Syncing it requires explicit consent, mapping, retention, and conflict behavior.

## Decisions required (human/product/security/engineering)

### 1) Identity & mapping
- [ ] Define stable mapping between local scene identity (`sceneId`/subsection id, local Dexie IDs) and server identity (`SubsectionId` / server entity IDs).
- [ ] Decide behavior when a scene is deleted, split, merged, reordered, or re-generated (label orphaning, reattachment, versioning).
- [ ] Decide whether labels attach to content hash/version, scene id, or both.

### 2) Consent, privacy, retention
- [ ] **Explicit opt-in** required before any label data leaves the device? (recommended: yes, separate from general sync and from `cloudAuditOptIn` unless deliberately unified.)
- [ ] What data is transmitted (ratings, dimensions, free-text notes, rater pseudonym/id, timestamps, pack/study IDs)?
- [ ] Retention period, deletion/export rights, and server-side access controls.
- [ ] Encryption posture: rely on transport/TLS only (current reality) or require E2EE before enabling label sync? (Phase 2 dependency.)

### 3) Conflict behavior (no CRDT)
- [ ] LWW per label row, append-only events, or manual conflict review?
- [ ] Multiple raters / same rater multiple passes: are conflicts expected and how represented?
- [ ] Interaction with existing `dirty wins` / `pending delete` / in-flight re-pend rules.

### 4) Scope
- [ ] Sync production `sceneLabels` only, human-review study exports, or both? (They have different privacy/provenance characteristics.)
- [ ] Local-only tables that must **never** enter sync payloads by default.

### 5) Implementation gates (once decided)
- [ ] Add schema/migration plan; update `SYNC_ENTITIES`/mapper **only** with explicit allowlist and tests.
- [ ] Add consent UI/state (clear, revocable), audit/logging as appropriate.
- [ ] Add server endpoints + RLS/authz + tests; verify no accidental inclusion in generic sync.
- [ ] Update docs (`docs/sync-status.md`, changelog, privacy notes) and CI/policy coverage.

## Default until decisions are made
- Keep label/human-review sensitive tables **local-only** unless explicitly designed, consented, and tested.
- Do not add labels to `SYNC_ENTITIES` opportunistically.
