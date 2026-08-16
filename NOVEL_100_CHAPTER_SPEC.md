# 100-Chapter Novel Specification

> ## Dataset Authority & Reconciliation Note
>
> This document is the **original planning scaffold** for the 100-chapter stress test. During validation, the actual dataset exercised by the pipeline and its tests diverged into **three distinct narratives**. To keep the deliverables consistent, this note declares which artifact is authoritative for what:
>
> | Artifact | Narrative | Role | Authority |
> |---|---|---|---|
> | `CONSISTENCY_LEDGER.md` | Aldric / Serra / Thaddeus / Vorn / Rissa — artifact & prophecy arc (P1–P7, 10 characters, Ch1–100) | **The validated end-to-end dataset.** Every S-001…S-097 issue, every cross-chapter continuity anchor, and the 7 deterministic rules are exercised against this arc. | **CANONICAL** for pipeline validation results. |
> | `src/tests/unit/consistencyNovel.test.js` | Elara Voss / Kaelen Dain — cult & Void God (fact ledger, fix-planning, fact-canon guard) | Focused unit-test fixtures for the consistency pipeline modules. | Authoritative for those unit tests only. |
> | This spec (`NOVEL_100_CHAPTER_SPEC.md`) | Dr. Elias Thorne — Choice Engine / multiverse (3 primary threads) | Planning scaffold written before the dataset crystallized. | **Non-canonical planning reference.** |
>
> **Reconciliation decisions:**
> 1. The ledger's Aldric/artifact arc is the source of truth for "what the 100-chapter stress test validated." All chapter counts, act boundaries (4-act: Origin 1–25 / Escalation 26–50 / Resistance 51–75 / Resolution 76–100), and the no-data-loss / no-duplication / all-7-rules gates are defined against it.
> 2. This spec's cast (Elias/Mara/Kael…) and 3-thread model are **not** the dataset the tests run against. They remain here as the original design intent; if a spec rewrite to the Aldric/artifact arc is desired, that is a follow-up (see `PIPELINE_VALIDATION_REPORT.md` §7, Risk 1).
> 3. Where the spec and ledger disagree on a structural property (e.g. thread count: spec says 3, ledger uses 7), the **ledger wins** for validation purposes.
> 4. The unit-test Elara/Kaelen fixtures are intentionally smaller and need not match either broader narrative.

## Story Premise
**Title:** The Chronos Paradox  
**Genre:** Literary Science-Fiction  
**Tone:** Melancholy, tense, philosophical  
**Logline:** A quantum physicist discovers that every choice they make spawns branching timelines, and must navigate the resulting multiverse to prevent reality from collapsing under the weight of unmade choices.

## Core Concept
The narrative center is the **Choice Engine** — a device that records every significant choice a character makes, creating a branching timeline for each. The story follows Dr. Elias Thorne, a quantum physicist who built the Engine, and the ripple effects as his choices echo across 100 chapters, spanning from 1985 to 2147.

## Cast (Principal + Recurring)

| ID | Name | Role | Goal | First Appearance |
|---|---|---|---|---|
| 1 | Dr. Elias Thorne | Quantum physicist, Engine creator | Preserve a single stable timeline | Ch.1 |
| 2 | Mara Vance | Former student, now rogue | Stop the Engine before reality collapses | Ch.12 |
| 3 | Director Kael Maren | Government agency | Control the Engine for national security | Ch.23 |
| 4 | Samuel Reyes | Elias's brother, businessmind | Monetize the Engine | Ch.5 |
| 5 | Dr. Ilya Voss | Rival physicist | Steal the Engine's secrets | Ch.17 |
| 6 | Lieutenant J. Harris | Military liaison | Contain the multiverse breach | Ch.34 |
| 7 | Anya Sharma | Engineer | Fix the Engine's core flaws | Ch.45 |
| 8 | The Archivist | Mysterious figure from future | Guide Elias through the paradox | Ch.78 |

## Recurring Locations

| ID | Name | Description | First Appearance |
|---|---|---|---|
| 10 | The Laboratory | Elias's quantum lab, Princeton | Ch.1 |
| 11 | The Observatory | Rooftop facility, views of the city | Ch.3 |
| 12 | The Safehouse | Hidden location, off-grid | Ch.12 |
| 13 | The Archive | Government facility, hidden | Ch.23 |
| 14 | The Junction | Cross-timeline waypoint | Ch.60 |
| 15 | The Collapse Site | Where reality thins | Ch.90 |

## Plot Threads (3 primary)

| ID | Title | Notes | First Appearance |
|---|---|---|---|
| 20 | The Choice Engine | Device that records every choice; creates branching timelines | Ch.1 |
| 21 | The Multiverse Breach | Reality begins to collapse under too many divergent timelines | Ch.50 |
| 22 | The Fixed Point | A timeline that refuses to branch; the "anchor" | Ch.75 |

## Chronology Model
- Chapters 1–25: Past (1985–2010) — Engine creation, early choices, first branching
- Chapters 26–50: Transition (2010–2025) — Consequences escalate, Agency involvement
- Chapters 51–75: Present (2025–2040) — Multiverse breach, resistance, fixes
- Chapters 76–100: Future (2040–2147) — Resolution, sacrifice, status quo

## Entity Interdependency Structure

### Characters & Their Relations
- **Elias Thorne** is the anchor — every thread connects to him directly or indirectly
- **Mara Vance** becomes the primary antagonist in the middle arc (Ch.50–75) — her goal evolves from stopping the Engine to preserving a single viable timeline
- **Kael Maren** represents institutional power — his chapters show the Agency's growing control
- **Samuel Reyes** provides the corporate/money angle — his chapters are often the catalyst for Elias's choices
- **Ilya Voss** is the rival physicist — his presence creates competitive tension
- **Recurring pattern:** No two characters who appear in the same chapter are unrelated — each pair has a reason for being together (scientific collaboration, family, conflict, romance).

### Location Network
- **The Laboratory** (Ch.1–20) → **The Observatory** (Ch.3–15) → **The Safehouse** (Ch.12–40) → **The Archive** (Ch.23–60) → **The Junction** (Ch.60–80) → **The Collapse Site** (Ch.90–100)
- Each location transition has a narrative reason (escape, discovery, confrontation, retreat)
- No location teleports without an establishing scene

### Timeline Integrity Rules (in-universe)
1. **No more than 3 active branches** at any time — the Engine auto-trim excess timelines
2. **The Fixed Point** (Chapter 75) is the one timeline that never branches — it's the anchor
3. **Information leakage** between branches is limited — the Engine has a "forgetting" function
4. **Choices have consequences** — the further from the origin, the more divergent

## Chapter Dependency Map (Key Cross-Chapter Links)

### Early Foundations (Ch.1–25)
- **Ch.1** introduces the Engine, Elias, Mara (as student), the first choice (to turn it on or off)
- **Ch.3** introduces the Observatory, the first timeline branch
- **Ch.5** Samuel Reyes appears; he wants to commercialize the Engine
- **Ch.12** Mara leaves Elias; the Engine is abandoned in the Safehouse
- **Ch.17** Ilya Voss arrives; he wants the Engine's secrets
- **Ch.23** Director Kael Maren appears; Agency claims the Engine
- **Ch.25** Engine is forcibly seized; Elias goes into hiding

### Middle Escalation (Ch.26–50)
- **Ch.34** Lieutenant Harris appears; military wants to contain the breach
- **Ch.45** Anya Sharma engineers a partial fix; the Engine works but is unstable
- **Ch.50** The Multiverse Breach begins — too many active timelines

### Present Resolution (Ch.51–75)
- **Ch.51–60** The team reunites at the Safehouse; Anya's fix is applied
- **Ch.60** The Junction is discovered — a cross-timeline waypoint
- **Ch.70** The Fixed Point is identified — one timeline that never branched
- **Ch.75** The Fixed Point becomes the anchor for restoration

### Future Resolution (Ch.76–100)
- **Ch.80** Elias enters the Fixed Point to reset reality
- **Ch.85** The Collapse Site is reached; reality is thinning
- **Ch.90** The final choice: sacrifice Engine or lose everything
- **Ch.100** Resolution: single stable timeline, Engine decommissioned

## Data Flow & Pipeline Exercises

### What the 100-Chapter Dataset Exercises

| Pipeline Area | How It's Exercised |
|---|---|
| **Character continuity** | 8 principal characters appear across all 100 chapters; relationships (allies, rivals, family, romantic, enemies, colleagues) evolve and are tracked via `CharacterRelationships` + `GraphEdges` |
| **Location consistency** | 15 named locations appear; each transition has an establishing scene; `checkLocationImpossible` fires on same-chapter teleports without travel |
| **State persistence** | Entity states (present/status/condition/location/attributes/knows) are derived from scene digests and must remain consistent across the 100-chapter arc |
| **Knowledge progression** | `checkKnowledgeRelearned` is exercised — characters learn facts that are relearned across chapters with intentional contradiction paths |
| **Timeline inversion** | `checkTimelineInversion` is seeded in early chapters (first scene references "yesterday" with no prior) |
| **Seam continuity** | `checkSeamContinuity` is exercised — some chapter boundaries have cast drops (no carried character) while others maintain carried casts |
| **Object tracking** | `checkObjectDestroyedThenUsed` — key objects (the Engine prototype, a journal, a photograph) are destroyed then used, or preserved across chapters |
| **Appearance consistency** | `checkAppearanceChange` — Elias's hair color, the Engine's casing color, etc. are asserted two ways at different points |
| **Network weaves** | `generateRelationships` is called 100 times (once per chapter); W11 unorderable drops exercise same-chapter claim contradictions |
| **Idempotency (W8)** | `idempotencyKey` is threaded through the Director skeleton and per-scene calls; a lost-response retry collapses; different keys produce fresh text |
| **Consistency audit** | `ConsistencyService.maybeRunIncrementalConsistency` runs at every chapter boundary; auto-fix rounds exercise the consistency feedback loop |
| **Deterministic hard gate** | All 7 rules fire on the entity-state timeline; the harness self-tests all 7 + 0 false positives on consistent arc |
| **Branch management** | The Choice Engine's branch limit (max 3 active timelines) is exercised — chapters 30–50 have 3 active branches, then cleanup |

### Deliberate Edge Cases

| Scenario | Chapters | Pipeline Test |
|---|---|---|
| **Cast drop** | Ch.12→13, Ch.45→46, Ch.73→74 | `checkSeamContinuity` flags `seam_disconnect` |
| **Location jump without travel** | Ch.8→9 (same chapter, different locations) | `checkLocationImpossible` fires |
| **Knowledge relearned** | Ch.15→Ch.20 (same fact restated differently) | `checkKnowledgeRelearned` fires |
| **Appearance change** | Ch.12 (Elias's hair changes), Ch.58 (Engine casing changes) | `checkAppearanceChange` fires |
| **Object destroy/rehab** | Ch.20 (Engine prototype destroyed), Ch.35 (rebuilt) | `checkObjectDestroyedThenUsed` fires |
| **Dead then alive** | Ch.3 (character presumed dead, reappears in Ch.15) | `checkDeadThenAlive` fires |
| **Timeline inversion** | Ch.1 (first scene references "the day before" with no prior) | `checkTimelineInversion` fires |
| **Network contradictions** | Ch.30–35 (3 active branches, relationship claims contradict) | `generateRelationships` W11 surfacing + deterministic checks |
| **Idempotency replay** | Ch.50 retry with same key collapses; Ch.70 fresh key → new result | W8 opt-in key contract |
| **Consistency auto-fix** | Ch.45–47 (3 rounds of rewrite→critique→rewrite) | ConsistencyService bounded fix rounds |

### Chapter Dependency Structure

The 100 chapters are **not independent**. Each chapter depends on:

1. **Previous chapter's state** — entity states carry forward
2. **Persistent entities** — characters, locations, threads introduced earlier
3. **Running plot threads** — the 3 primary threads (Choice Engine, Multiverse Breach, Fixed Point) have evolving goals
4. **Network edges** — `CharacterRelationships` and `GraphEdges` from prior chapters affect later ones
5. **The Choice Engine's branch state** — active timelines count, which characters know about which branches

**No chapter is generated in isolation.** The prompt for each chapter includes:
- A summary of the previous chapter's events
- The current state of active branches
- The characters present and their goals
- Any lingering unresolved threads
- The chapter's position in the 4-act structure

### Narrative Beat sheet (summary)

| Act | Chapters | Key Events |
|---|---|---|
| **Act 1: Origin** | 1–25 | Engine created; first choice; Engine abandoned; Agency arrives |
| **Act 2: Escalation** | 26–50 | Multiverse breach emerges; Agency involvement; partial fix applied |
| **Act 3: Resistance** | 51–75 | Team reunites; Fixed Point identified; restoration begins |
| **Act 4: Resolution** | 76–100 | Final choice; Engine decommissioned; single stable timeline |

### Consistency Rules In-Universe

The story itself acknowledges the pipeline constraints:
- "The Engine can only maintain 3 active branches" — explained as a resource limit
- "The Fixed Point is the only timeline that doesn't branch" — treated as a physical constant
- "Information fades between branches" — why characters sometimes don't remember earlier choices
- "Every choice has a consequence — eventually" — the theme

## Production Notes

**Generated using the project's actual pipeline** (not mocks), leveraging:
- `useVolumeStoryGenerator.ts` phase machine
- `useStoryWriter.ts` two-pass generation
- `useStoryCritic.ts` quality + continuity gates
- `generateRelationships` with W11 surfacing
- `deterministicContradictions.ts` 7-rule hard gate
- `aiService.ts` W8 idempotency opt-in
- Dexie → PostgreSQL sync via `commitSync`

**Intentionally seeded inconsistencies** that the pipeline must correctly handle (or flag):
- Cast drops at chapter boundaries (test `checkSeamContinuity`)
- Same-chapter location teleports (test `checkLocationImpossible`)
- Knowledge relearned with contradictory sourceFacts (test `checkKnowledgeRelearned`)
- Appearance changes across chapters (test `checkAppearanceChange`)
- Network weave contradictions (test W11 + deterministic)
- Idempotency key reuse vs fresh keys (test W8)

**Each chapter's structured metadata** (summary, usedEntities, newEntities, networkEvents, keyFacts) is designed so that `deriveEntityStates` produces a valid entity-state timeline that the deterministic rules can run over — meaning the 100-chapter dataset is valid input for the consistency engine, not just "story text."

---
*Specification generated as deliverable 2 of the 100-chapter stress test process.*