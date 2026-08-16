# NOVEL_100_CHAPTER_SPEC.md

**Working title:** *The Fractured Lattice*
**Canon hook:** Continues the Veylthar setting used in `generated-novel/`. 100 chapters, ~3000 words each (except seeded boundary chapters). Treated as a **large interconnected domain model**, not 100 independent texts.

The purpose of this spec is to give the validation harness (`scripts/validate-100-chapter.mjs`, Phase 3/4) a fully-specified, deterministic dataset so that every pipeline module, persistence path, and failure mode is exercised. The prose is generated/represented by structured chapter records; the *consistency* lives in the metadata, entities, facts, and references — exactly what the real pipeline's consistency service, fact ledger, guards, and sync transport consume.

---

## 1. Premise (established in Chapter 1)

In the city of **Veylthar**, the **Lattice** — a continent-spanning network of ley-channels that carries light, memory, and time — is fraying. **Elias Varn**, a disgraced archivist of the Archives of Veylthar, discovers the *Tome of the First Convergence*, which records a celestial alignment ("**the Convergence**") that once birthed, and can unmake, the god of decay **Morthaen**. The secret cult **the Threnody** plots to reignite the Convergence to resurrect their deity and remake the world. Elias, torn between stopping them and seizing the power, is joined by a shifting alliance as the Lattice fails chapter by chapter.

---

## 2. Entities

### 2.1 Characters (cast) — `characters` table

| id | name | role | core trait(s) | firstSeen | arc |
|----|------|------|--------------|-----------|-----|
| C1 | Elias Varn | protagonist / archivist | paranoid, obsessive | 1 | sanity erosion → ambiguous apotheosis |
| C2 | Morrin Kael | reformed Threnody cultist | calculating, mysterious | 1 | redemption |
| C3 | Lysara | Elias's former apprentice | betrayal-prone | 1 | defection → return |
| C4 | Captain Brann Oru | city watch | loyal, by-the-book | 2 | loses faith in the Watch |
| C5 | Sister Yvane | priestess of the Lattice | compassionate, dogmatic | 3 | schism |
| C6 | Torvan Esh | smuggler / informant | mercenary, witty | 4 | reluctant heroism |
| C7 | The Hierarch Duskwane | Threnody leader (antagonist) | implacable, messianic | 5 | unraveling |
| C8 | Mireille Voss | scholar ally | brilliant, secretive | 8 | revealed double agent (ch62) |
| C9 | Seraph Duskbane | rogue Lattice-weaver | reckless, gifted | 12 | sacrifice (ch85) |
| C10 | The Echo of Morthaen | god's fragment (non-corporeal) | cryptic, hungry | 20 | possession of Elias (ch90) |
| C11 | Pell the Cartographer | minor, introduced ch22 | meticulous | 22 | his map resolves ch63 |
| C12 | Warden Cas | Watch interrogator | rigid | 30 | switches sides (ch78) |

Plus ~30 recurring NPCs (guards, cultists, merchants) introduced progressively; each gets a stable id and `firstSeen`.

### 2.2 Locations — `locations` table

L1 Archives of Veylthar (ch1), L2 Lattice Spire (ch2), L3 The Sunken Quarter (ch4), L4 Convergence Plateau (ch6), L5 Threnody Sanctum (ch5), L6 Floating Market of Cinder (ch9), L7 The Ashlands (ch15), L8 Duskwane's Redoubt (ch33), L9 The Silent Library (ch48, discovered), L10 The Shattered Causeway (ch71, built from L1 rubble).

### 2.3 Plot threads — `plotThreads` table

| id | title | status lifecycle |
|----|-------|-----------------|
| T1 | The Celestial Convergence | planted ch1 → active → resolved ch100 |
| T2 | The Cult's Resurrection Plot | planted ch5 → escalates → defeated ch95 |
| T3 | Elias' Sanity Erosion | ch1 → ch90 possession |
| T4 | The Lattice Fraying | ch2 → cascading failures → ch100 reset |
| T5 | Lysara's Betrayal Arc | ch10 setup → ch40 betrayal → ch73 redemption |
| T6 | Morrin's Redemption | ch1 setup → ch66 proof → ch92 |
| T7 | The Search for the Second Tome | ch18 → ch59 found |
| T8 | Alliance with the Watch | ch2 → ch44 collapse → ch80 new compact |
| T9 | Mireille's Double Game | ch8 hint → ch62 reveal → ch89 atonement |
| T10 | The Final Convergence | ch1 foreshadow → ch100 climax |

---

## 3. Relationships — `characterRelationships` / `graphEdges`

Examples (stable, validated):

- (C1, C3, mentor-apprentice, broken@ch40, restored@ch73)
- (C1, C2, rivals→uneasy allies@ch25)
- (C2, C7, former acolyte of Hierarch)
- (C4, C1, protector→estranged@ch44)
- (C8, C7, planted mole)
- (C10, C1, possesses@ch90)

Each relationship edge carries `validFromChapter` / `validUntilChapter` so supersession is explicit (directly exercises W10 / `planEdgeWrites`).

---

## 4. Timeline model

- In-world time spans ~2 years across 100 chapters.
- **Chapters 1–97**: linear chronology (chapter number = chronological order).
- **Flashbacks** at ch40, ch70, ch88 establish events *before* ch1 (retroactive `firstSeen` is allowed **only** when `flashback: true`); a non-flashback chapter referencing a pre-ch1 event without that flag is a consistency violation.
- **Long-chain dependencies** (must hold):
  - Pell (C11) introduced ch22 → his map is the *only* route to the Silent Library (L9, ch48) → resolves the Second Tome search (T7) at ch59 → the Tome's cipher unlocks ch63.
  - Elias's paranoia (C1 trait, ch1) → justifies isolating himself ch34 → enables the Echo's possession setup ch90.
  - Lysara's betrayal ch40 → Morrin's proof of loyalty ch66 → final stand ch92.

---

## 5. Cross-chapter dependency rules (enforced by validation)

- **D1** An entity referenced in chapter Y with `firstSeen > Y` is invalid unless `flashback: true`.
- **D2** A `keyFact` in chapter Y that negates a fact from chapter X (< Y) is a **legal state transition** only if the later chapter explicitly states the change; an *undisclosed* negation is a fact-canon violation (S4).
- **D3** If character dies in chapter D, any appearance in chapter > D (alive) is a violation unless a resurrection fact exists in (D, appearance].
- **D4** A location destroyed in chapter X cannot be visited in chapter > X unless a rebuild fact exists.
- **D5** Facts accumulate monotonically; the fact ledger must be re-sortable by chapter regardless of ingestion order (out-of-order delivery must not corrupt ordering).

---

## 6. Consistency invariants (the validation contract)

| ID | Invariant | Module that enforces |
|----|-----------|----------------------|
| R1 | `charactersPresent` ⊆ established ∪ introduced-this-chapter | `entityGuard` + `undocumentedCharacterGuard` |
| R2 | Every `graphEdges` endpoint references an existing entity | sync `integrityGuard` / `useConsistencyChecker` |
| R3 | Fact ledger monotonic & order-independent | `buildFactLedger` |
| R4 | No alive-after-death without resurrection fact | `deterministicContradictions.checkDeadThenAlive` |
| R5 | No visit-after-destruction without rebuild fact | `checkLocationImpossible` |
| R6 | Every cast member appears ≥1× per 15-chapter window | name-presence check |
| R7 | No duplicate server entity id after sync | sync idempotency (target fix for W7) |
| R8 | Every plot thread referenced ≥1×; none silently dropped | dropped-thread check |
| R9 | Retry / duplicate chapter id must be idempotent (no double-write) | idempotency (target fix for W8/W7) |
| R10 | Salvaged scene (empty metadata) must not poison downstream context | writer salvage path (target fix for W1) |

---

## 7. Seeded edge-case matrix (§6 of the brief)

Each row is a chapter (or chapter range) that deliberately exercises a failure mode. The harness injects the scenario and asserts the *correct* behavior; a wrong/again-missing behavior is a discovered issue.

| Chapter(s) | Scenario | What it must prove |
|-----------|----------|-------------------|
| 3 | Missing data | Chapter with empty `keyFacts` → integrity guard flags; downstream ledger still valid. |
| 7 | Invalid data | Malformed `structured` (wrong types) → schema/integrity guard rejects; not silently persisted. |
| 11 | Duplicate data | Same `keyFact` as ch5 → ledger dedupes; no double-count. |
| 14 | Conflicting updates | Chapter asserts both "Elias trusts Morrin" and "Elias distrusts Morrin" with no transition → contradiction detected (not silently kept). |
| 18 | Out-of-order event | Chapter ingested *before* ch10 in the stream → ledger re-sorts; no gap. |
| 22 | Long-chain intro | Pell (C11) introduced; must be reachable from ch63. |
| 27 | Retry operation | Chapter delivered twice (same id) → idempotent; single persistence. |
| 30 | Partial failure | Prose written, metadata extract failed → salvage path (W1) must not poison ch31 context. |
| 33 | Failed transaction | Sync `pushOne` throws → no duplicate server row on retry (W7). |
| 41 | Concurrent update | ch41 & ch42 both modify C1 trait → deterministic last-writer; no lost update. |
| 46 | Stale data | Chapter references pre-edit entity state → `commitSync` must resolve current `nameToId` (W6). |
| 52 | Referential violation | Edge to nonexistent entity → orphan detected; not persisted (R2). |
| 60 | Consequence | Effect of ch22 Pell setup lands (long chain intact). |
| 63 | Payoff | Pell's map unlocks cipher (ch22→ch59→ch63 chain). |
| 70, 88 | Flashback | Retroactive establishment allowed only with `flashback:true` (D1). |
| 74 | Boundary | 0-word / empty chapter → handled, not崩溃. |
| 81 | Large payload | 200+ `keyFacts` → performance within budget. |
| 90 | Entity change | C10 possesses C1 → valid state transition recorded (D3/R4). |
| 94 | Recovery | Previously failed chapter re-delivered → system consistent. |
| 99 | Idempotency | Same chapter id re-pushed to sync → single server row (R7/R9). |
| 100 | Final convergence | All 10 threads resolved; no orphaned entities; ledger coherent. |

---

## 8. Chapter record schema (the dataset shape)

Each of the 100 records in `validation/novel-100-data.json`:

```jsonc
{
  "id": "ch-0001",
  "chapterNumber": 1,
  "title": "The Archivist's Error",
  "flashback": false,
  "prose": "<generated/representative text>",
  "summary": "…",
  "wordCount": 3000,
  "location": "L1",
  "charactersPresent": ["C1", "C2", "C3"],
  "introducedEntities": ["C1", "C2", "C3", "L1", "T1", "T2", "T3"],
  "keyFacts": ["Elias found the Tome of the First Convergence", "The Threnody cult seeks the Convergence"],
  "plotThreadsTouched": ["T1", "T2", "T3"],
  "edges": [["C1","C3","mentor-apprentice"]],
  "references": [{ "to": "ch-0005", "kind": "foreshadow" }],
  "negations": [],          // facts from earlier chapters this chapter negates (must be explicit)
  "scenario": null          // one of the §7 edge-case tags, else null
}
```

The harness transforms these into the real module inputs: `buildFactLedger(spine, writtenScenes)`, `createFactCanonGuard` (`keyFacts`), `checkContradictions` (`characters`/`locations`/`sceneProse`/`ledger`), `deterministicContradictions` (entity state timeline), the guardrail registry (`entity`/`integrity`/`undocumented_character`/`fact_canon`), `ConsistencyService` audit, and `SyncTransport.pushOne` (idempotency/duplicate simulation).

---

## 9. Consistency rules summary (for the ledger)

1. No entity changes without an explicit in-world reason (retcon requires a `negations`/`edges` update).
2. No information disappears unless a chapter/pipeline action removes it (deletion is a logged event).
3. References between entities remain valid for the chapter's lifetime.
4. Chronology is coherent; flashbacks are explicitly flagged.
5. The Lattice state (T4) degrades monotonically until the ch100 reset.

This spec is the contract; `CONSISTENCY_LEDGER.md` records every deviation the harness finds, its root cause, the fix, and the regression test.
