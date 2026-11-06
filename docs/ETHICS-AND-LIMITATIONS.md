# Ethics, Evidence and Limitations

Status: 2026-11-06. This document describes what Versatile claims, what it does
not claim, what data leaves the device, and where its heuristics are
English- and prose-fiction-shaped. It is not a substitute for a provider's
terms or an institution's ethics review.

## 1. What this project is

Versatile is a local-first writing aid: an editor, a story bible, a scene
graph, and a pipeline that plans, drafts and critiques fiction. It is not an
autonomous author, a quality certification, or a plagiarism detector. A gate
that passes means "this check found no issue"; it does not mean a reader will
enjoy the scene.

The default path is local. Ollama runs on the user's machine, and the browser
database is the source of truth. Optional features can send content to a
server or a cloud model; section 3 states what each one sends.

## 2. Evidence status

The repository distinguishes measured results from fixtures. Nothing below is
a human-label study unless it says so.

| Artifact | What it is | What it is not |
|---|---|---|
| `reports/live/labelling` 78-scene corpus | Two independent **Claude reviewer** passes | Human labels. Human labels remain **0** |
| 12-scene pilot in `docs/LABELLING-RUBRIC.md` | A planned human-reference pilot, shortest scenes only | A completed study, a representative sample, or a gate calibration |
| `reports/live/planted-flaws-145` | Injected defects with known locations | Natural prevalence of continuity or voice problems |
| `reports/live/masterpieces` | Public-domain passages used as controls | Proof that the current gate measures literary quality |
| `validation/PIPELINE_VALIDATION_REPORT.md` | A deterministic 100-chapter structured-data harness | A 100-chapter prose benchmark |
| `reports/live/retrieval-eval/results.json` | 40 fact queries over 30 scenes from **one** book, MRR 0.671 | Cross-book retrieval validation or a reason to change the index |
| `tools/judge-bench/constory_within.py` result | 1/20 positive examples flagged, 0/20 located, 0/20 negatives flagged | A production-ready checker or human ground truth |
| `npm run smoke:scene` / `smoke:quality` | Fixtures that stamp `EVIDENCE_STATUS` and are `nonEvidence` in the register | Model-quality measurements |

The current gate is continuity + voice only; show-tell, pacing and
emotional-goal are advisory. The 78-scene corpus is not a substitute for the
12-scene human pilot, and the pilot is not a substitute for a stratified,
book-level holdout. Until those exist, claims should say "this check found no
issue" rather than "this scene is good".

The checked-in evidence register
(`tools/judge-bench/evidence-register.json`) and snapshot
(`tools/judge-bench/evidence-snapshot.json`) record claim status and source
hashes; the frozen rubric and the unstarted human pilot are in
`docs/LABELLING-RUBRIC.md`. `npm run evidence:check` fails when a gate or prompt source drifts
without an intentional snapshot update. Do not cite a number that is not in
the register.

## 3. Data flow and consent

| Path | What leaves the device | When |
|---|---|---|
| Local editing | Nothing | Always, unless sync or a cloud feature is used |
| `localOnly` ("Run everything locally") | Nothing to a model provider | It overrides the provider, fallback and cloud-escalation paths, even if `analysisTier` or a feature route says otherwise |
| Optional sync | Project metadata, manuscript and scene text, story-bible entities, research-document content, labels if a label mapper is ever added | When the user signs in and sync runs |
| Cloud on demand | The selected manuscript or scene text plus the system prompt | After the user confirms the per-run disclosure |
| Cloud audit (background) | The selected scene or manuscript text plus the system prompt | Only when the global `analysisTier` is `cloud-audit` **and** that project's `cloudAuditOptIn` is true |
| Cloud provider keys | The key goes to the provider the user configured; the SPA also keeps a local copy for browser-side calls | When the user saves a key |

Consent details that matter:

- `cloudAuditOptIn` is stored on the **project row**, not in browser settings.
  Opening a different book starts from that book's own value.
- Consent is per device. It is not part of the sync payload, so a second device
  must opt in itself.
- `requestCloudEscalation` refuses a request whose caller passes no consent;
  the UI is not the only guard.
- Provider retention, training use and jurisdiction are set by the provider,
  not by this application. Read the provider's terms before sending private or
  unpublished work.
- Sync is not end-to-end encrypted. The server stores project and manuscript
  content in PostgreSQL; the deployment operator can read it.
- Backups and exports are local files. Treat them with the same care as the
  manuscript.
- The human-review study workspace is local-only. Imported packs, anonymous
  rater sessions and responses stay in IndexedDB; the export is a local JSON
  file. The workspace does not sync, call a model or send anything to a cloud
  provider.

## 4. Authorship and responsible use

- **Disclose AI assistance** where a publisher, contest, employer or platform
  requires it. The tool cannot know those rules.
- **The author remains responsible** for facts, defamation, privacy,
  copyright and consent from real people depicted in the work.
- **Do not use the tool to impersonate** a living person's voice or to produce
  material designed to deceive about authorship.
- **Uncensored models are opt-in.** `dolphin-mistral:7b` can produce content
  that `qwen3:8b` refuses. The user chooses it and remains responsible for the
  output and for the audience it reaches.
- **Do not treat generated prose as verified fact.** The critic checks some
  continuity and voice signals; it does not fact-check research, law, medicine
  or history.

## 5. Language and domain limitations

The current implementation is English- and prose-fiction-shaped. This is a
scope statement, not a claim that other languages fail gracefully.

- **Tokenisation and word counts** use whitespace and English-oriented
  splitting. Languages without spaces, or with different punctuation, will be
  counted and chunked poorly.
- **Heuristics and regexes** are English: `[a-z]` tokenisation in the
  retrieval eval, `Ch(\d+):` fact parsing, English stop-word lists, English
  repetition and opening-reuse checks, and English prompt templates.
- **The gate dimensions** (continuity, voice, show/tell, pacing,
  emotional-goal) were specified on English prose. Their thresholds have not
  been validated in another language or in screenplay, poetry, interactive
  fiction or non-fiction.
- **Structure vocabulary** (Chapters/Scenes) is configurable per workspace
  type, but the prompts, gates and analysis passes still assume prose fiction.
- **Small local models** are nondeterministic and memory-bound. The same
  prompt can produce different prose, and a run that passed once is not a
  reproducibility guarantee. Model versions and prompt hashes are recorded in
  the evidence snapshot, but generation is not seeded.
- **The UI copy is English.** There is no localization or right-to-left
  layout claim.

## 6. Human-subject research protocol

No human-label study has run. When one does, the minimum protocol is:

1. **Informed consent** before any scene is shown: purpose, time, risks,
   compensation, withdrawal, and who will see the labels.
2. **Minimal data.** Label excerpts or scene ids, not unnecessary personal
   information. Do not publish manuscript text without separate permission.
3. **Independent passes** where agreement is being measured. Do not show one
   rater the other's labels.
4. **Keep unsure/N/A** as an answer. Never coerce it to Problem/Fine.
5. **Adjudication is separate** from the independent passes and is reported
   as such.
6. **Store labels separately from the manuscript** and document the label
   provenance (`human`, `model`, `merged`) in the evidence register.
7. **Report agreement and uncertainty**, including the number of raters, the
   overlap, and the scenes that were excluded.
8. **Institutional review** where the researcher's institution requires it.
   This document is not an ethics approval.

## 7. What would change these statements

- A completed human pilot with at least two independent raters and reported
  agreement.
- A stratified, book-level holdout with pre-registered recall and
  false-rewrite criteria.
- A multilingual labeled test set and localized prompts.
- A consent and retention design for synced labels, if labels are ever synced.
- A measured cross-book retrieval result from the new manifest harness.

Until then, the honest summary is: local-first writing aid, narrow and
partially validated quality checks, no human-label evidence, and explicit
consent for the paths that leave the device.
