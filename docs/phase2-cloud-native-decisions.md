# Phase 2 cloud-native: decision matrix (parked)

**Status:** requires explicit scoping/architecture/product decisions. Current implementation is **local-first/IndexedDB per browser profile**, opt-in server sync for selected tables, **LWW**, **no CRDT/merge/conflict UI**, **not E2E encrypted**. `dirty` local changes are protected in key cases; in-flight edits re-pend; rejected deletes block `lastSync`. Many tables remain local-only.

## Decisions required (human/architecture/product/security)

### 1) Authority & conflict model
| Option | Pros | Cons / requires |
|---|---|---|
| Keep **client-wins/LWW** with better visibility | Minimal change | Silent overwrites remain possible; not true collaboration |
| **Server-authoritative** with conflict UI | Clear source of truth | Conflict UX, merge semantics, latency/offline behavior |
| **CRDT/OT** for selected data (text/scenes/metadata) | Collaboration-grade merging | Major complexity; choose scope (prose vs structure vs metadata); perf/storage |
| **Field-level merge** for low-risk metadata | Targeted improvement | Define per-field rules; still hard for prose/structure |

**Decide:** which entities get which model; what “conflict” means; offline/reconnect semantics; undo/restore expectations.

### 2) Encryption & privacy
| Option | Implications |
|---|---|
| **TLS only** (current) | Server can access data; simpler ops/search |
| **End-to-end encryption (E2EE)** | Strong privacy; key management/recovery, sharing/collaboration limits, server-side features constrained |
| **Hybrid** (E2EE for prose, metadata searchable) | Complex boundaries; clear threat model required |

**Decide:** threat model, key management, recovery, multi-device, sharing, compliance/retention, and which features become impossible/changed.

### 3) Identity, sharing, tenancy
- [ ] Single-user multi-device only, or collaboration/sharing?
- [ ] Org/workspace permissions model (backend RLS/policies already relevant; verify coverage).
- [ ] Device/session management, revocation, audit.

### 4) Data scope & contracts
- [ ] Which local-only tables (if any) become syncable, and under what consent?
- [ ] Blob/large payloads (covers, attachments, compiled artifacts): size limits, quotas, storage backend, cost.
- [ ] Deletion semantics across devices (tombstones, retention, legal/privacy deletion).
- [ ] Migration/backfill for existing local-only data (the Phase 1 queue helper is a starting point, not a full CRDT/merge solution).

### 5) Reliability & observability
- [ ] Conflict/merge telemetry (privacy-aware).
- [ ] Sync correctness test strategy (integration, fuzz/property tests for LWW/merge rules).
- [ ] Rate limits, backpressure, partial-failure handling (beyond current table-level behavior).

## Recommended next step (human)
Produce a short **Phase 2 scope RFC** selecting: (a) target user scenario (multi-device single user vs collaboration), (b) conflict model per entity class, (c) encryption posture, (d) non-goals for v1. Then implement in vertical slices with tests and migration plans. Do not broaden sync to sensitive/local-only data without explicit consent and design.