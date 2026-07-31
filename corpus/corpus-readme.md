# Critic Snapshot Corpus

Each `*.json` file is a scene to evaluate. The `_meta` block documents what the
critic *should* find — used by `--validate` to sanity-check a stored snapshot.

| File | Expected | Min | Max | Purpose |
|------|----------|-----|-----|---------|
| good-pass.json | pass ✅ | 7 | 10 | Well-written scene — clear goal, tension, payoff |
| clear-fail.json | fail ❌ | 0 | 4 | Contradictory, tell-heavy, off-goal scene |
| borderline.json | pass/fail ⚠️ | 4 | 8 | Mixed quality — good core but pacing/voice issues |

Snapshots are written to `corpus/__snapshots__/<fixture>.snapshot.json`.

## Commands

```bash
npm run eval:snapshot -- --take-all       # record the baseline (calls the AI)
npm run eval:snapshot -- --check-all      # re-run and compare (calls the AI)
npm run eval:snapshot -- --validate-all   # offline: is the baseline still current?
npm run eval:snapshot -- --show-prompt good-pass
```

`--check` is the regression gate: it re-runs the critic and fails (exit 1) when a
dimension drops ≥2 points against the baseline, or when a fixture's overall score
falls below its pass threshold. `--validate` is the free offline counterpart — it
never calls the AI, and only reports whether the stored snapshot still matches
current prompt construction.

Set `REGRESSION_FAIL_ON_MINOR=1` to also fail on single-point dimension dips.

## The second corpus

`src/tests/fixtures/eval-corpus/` holds four richer scene fixtures in a slightly
different shape (`sceneBrief`/`sceneId`/`workspaceType` instead of
`scene`/`_meta`/`categoryType`). Both shapes are accepted — point the tool at it
with:

```bash
EVAL_CORPUS_DIR=src/tests/fixtures/eval-corpus npm run eval:snapshot -- --take-all
```

Each corpus keeps its own `__snapshots__/` directory, so baselines never collide.
