# ML Pipelines

5 automated ML pipelines built on Versatile's existing AI generation and evaluation infrastructure.

## Pipelines

| Pipeline                 | Location                | Purpose                                                                                                                                                                                             |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quality Regression**   | `quality-regression/`   | Gate generation quality against curated test synopses per workspace type. Flags regressions before shipping prompt changes.                                                                         |
| **Model Benchmarking**   | `model-benchmarking/`   | Benchmark AI providers (Ollama, OpenAI, Anthropic, Gemini, Groq) across eval dimensions — quality score, latency, cost per run. Supports single/multi-model comparison via `OLLAMA_MODELS` env var. |
| **Active Learning**      | `active-learning/`      | Identify dimensions with consistently low scores, flag them for prompt template improvement, and validate fixes.                                                                                    |
| **Fine-tuning Curation** | `fine-tuning-curation/` | Score past generations by eval dimension, surface top-N candidates for fine-tuning datasets, filter low-quality runs.                                                                               |
| **Drift Monitor**        | `drift-monitor/`        | Track generation quality over time per dimension per workspace type. Detect drift after provider model updates.                                                                                     |

## Shared Conventions

- **Runner pattern**: CLI scripts using `vite-node` (see `package.json` `eval:rag` example)
- **Report output**: `reports/` directory — JSON for machine consumption, MD for human review
- **Pure evaluation**: All gate functions (`src/services/evalGates.js`) are pure — no Vue dependency, usable from CLI
- **Dimensions**: 10-point rubrics from `src/config/evalDimensions.js` with workspace-specific dimension sets
- **Baselines**: JSON files in `baselines/` directory for comparison across runs

## Running

```bash
npm run pipeline:quality
npm run pipeline:benchmark
npm run pipeline:active:sample   # Active Learning — analyze sample eval history
npm run pipeline:active          # Active Learning — analyze full eval history
npm run pipeline:curate:sample   # Fine-tuning Curation — demo with sample data
npm run pipeline:curate          # Fine-tuning Curation — run with --source
npm run pipeline:curate:export   # Fine-tuning Curation — export training set (JSONL) from exported JSON
npm run pipeline:curate:train    # Fine-tuning Curation — export training set from sample data
npm run pipeline:drift:sample    # Drift Monitor — demo with sample data (16 evals)
npm run pipeline:drift:synthetic # Drift Monitor — synthetic drift dataset (100 evals, threshold 1)
npm run pipeline:drift:edge      # Drift Monitor — edge case dataset (80 evals, threshold 1)
npm run pipeline:drift           # Drift Monitor — run with --source
```

## Model Benchmarking

Compares providers on a shared test suite, producing a JSON report with per-test results, aggregates, rankings, and a comparison matrix.

**Environment variables:**

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` — enable remote providers
- `OLLAMA_MODEL` — single Ollama model (default: `phi4-mini:3.8b`)
- `OLLAMA_MODELS` — comma-separated list for multi-model comparison in one run: `phi4-mini:3.8b,dolphin-mistral:7b`
- `OLLAMA_ENDPOINT` — custom Ollama host (default: `http://localhost:11434`)
- `JUDGE_MODEL` — the model that grades the outputs. Defaults to the first remote provider with a key (Groq: `llama-3.3-70b-versatile`), else Ollama `qwen3:8b`. It is deliberately separate from `OLLAMA_MODEL`: the old fallback graded each output with the model that wrote it. If the judge is also under test the run prints a warning and the report records `judge.selfJudged: true`. Note that every remote default judge is also one of that provider's benchmarked models (Groq benchmarks `llama-3.3-70b-versatile` and judges with it), so with a key set, pick a `JUDGE_MODEL` outside the contest.
- `JUDGE_PROVIDER` — force the judging provider (`ollama`, `groq`, …).

**Exit code:** `1` when any provider completes 0 cases in a suite (for example a model that is not installed), or when any score is a placeholder because the judge call failed; the reasons print under `BENCHMARK FAILED`. `1` also when no provider is available. Earlier versions exited `0` in all of these cases.

## Active Learning

Aggregates eval scores per dimension per workspace type and flags dimensions consistently below threshold. Uses `dimension-prompt-map.json` to surface targeted improvement guidance and example snippets for each flagged dimension.

**Output:** `reports/active-learning-report.json` — includes workspace-level aggregates, per-dimension stats (mean, min, max, stddev), and sorted recommendations (insufficient data first, then widest gap).

## Fine-tuning Training Set Export

Exports curated training examples from eval history as JSONL files for model fine-tuning. Each training example pairs a scene's prose with its structured critique (dimension scores, issues, strengths).

### Workflow

```
1. Export eval history from the browser app (triggers JSON download)
2. Curate and export training sets:
   npm run pipeline:curate:export -- --source path/to/exported-eval-history.json
```

### Flags

| Flag           | Description                                      | Default       |
| -------------- | ------------------------------------------------ | ------------- |
| `--source`     | Path to exported eval JSON (required)            | —             |
| `--content`    | Path to content lookup JSON (overrides embedded) | embedded data |
| `--top-k`      | Max training examples to output                  | 100           |
| `--floor`      | Minimum quality score to include                 | 5             |
| `--format`     | Output format: `jsonl` or `json`                 | `jsonl`       |
| `--min-samples`| Minimum eval samples per workspace               | 3             |

### Output

- `reports/training-data-{workspaceType}.jsonl` — one JSON object per line: `{ prompt, completion, evalId }`
- `reports/training-export-summary.json` — export metadata and counts
