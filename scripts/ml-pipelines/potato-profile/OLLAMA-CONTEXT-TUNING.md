# Ollama context tuning

How to give the local model a bigger usable context without buying RAM.

Everything below was measured on this project's target machine on **2026-08-05**:
Ollama **0.32.5**, `qwen3:8b`, 15.4 GB system RAM. Re-measure before trusting any
of it on different hardware or a newer Ollama — the numbers move.

## What the app already does

`num_ctx` is set explicitly to **16384** ([`src/config/ollama.ts`](../../../src/config/ollama.ts))
and sent on every request. This matters more than it looks: Ollama defaults to
4096 on any machine under 24 GiB VRAM, and **prompt overflow is silent and
lossy** — a measured 6,153-token prompt at `num_ctx=4096` had only 2,050 tokens
evaluated. No error, no warning, and not even a clean truncation to the limit.

So the failure this setting prevents is not "the model errors", it is "the model
quietly answers using a third of what you sent".

## KV cache quantization

The KV cache is what grows with context length. It is **not** the model weights,
and quantizing it is independent of the model's own quantization.

`qwen3:8b` reports 36 layers, 8 KV heads, head_dim 128 (`/api/show`). With
`bytes/token = 2 × layers × kv_heads × head_dim × bytes_per_elem`:

| cache type | per token | @16k | @32k | @40k (trained max) |
| ---------- | --------- | ---- | ---- | ------------------ |
| `f16` (default) | 144 KB | 2,304 MB | 4,608 MB | 5,760 MB |
| `q8_0` | 72 KB | 1,152 MB | 2,304 MB | 2,880 MB |
| `q4_0` | 36 KB | 576 MB | 1,152 MB | 1,440 MB |

**`q8_0` buys 32k of context for what 16k costs today.** Quality loss is
described upstream as "very small" and it is the setting to use.

**`q4_0` is not recommended here.** The loss is "small-medium" on general
workloads, and this app generates long-form prose where degradation shows up as
exactly the failure modes the pipeline already fights — repetition and drift.
Halving memory again is not worth it.

Note `qwen3:8b` is trained to **40,960** context, not the 131k some model cards
suggest, so ~32k is the practical ceiling regardless of available RAM.

### Enabling it

This is a **server-side, global** setting. It cannot be set per request, which is
why it lives in this document instead of in the codebase — the app has no way to
apply it.

```bash
setx OLLAMA_FLASH_ATTENTION 1
setx OLLAMA_KV_CACHE_TYPE q8_0
```

Restart the Ollama server afterwards. On Linux/macOS use `export` in whatever
starts the service.

### Verifying it actually took effect

**It fails silently.** KV quantization requires Flash Attention, and on an
architecture that does not support FA it falls back to `f16` with no error — you
get the default and no indication that you asked for anything else.

`qwen3` was on the FA allowlist as of Ollama 0.15.5; `phi3` (so `phi4-mini`) was
not. That allowlist has not been re-verified on 0.32.5, so confirm rather than
assume:

```bash
curl -s http://localhost:11434/api/ps
```

Load a model first, then compare the reported `size` against `size_vram` and the
table above. If resident memory at 32k matches the `f16` row rather than the
`q8_0` row, the fallback happened and the setting did nothing.

## OLLAMA_NUM_PARALLEL multiplies context, it does not divide it

RAM scales as `NUM_PARALLEL × context_length` — each slot is allocated a full
window. The default is `1`; raising it to 4 quadruples KV memory.

This is the opposite of raw `llama-server`, which *divides* `--ctx-size` by
`--parallel`. Do not carry that intuition across.

## Where the context actually goes

Tuning the window is the smaller half. What gets put in it matters more, and two
of the three big consumers are now bounded:

- **Entity blob** — was the whole project cast on every scene write, rebuilt each
  time. Now narrowed to the volume being written
  ([`src/services/volumeScope.ts`](../../../src/services/volumeScope.ts)). Measured on a
  5-volume book: ~8,342 → ~1,682 tokens, about 6,660 saved per scene.
- **Story-so-far** — the last 20 scene summaries, plus a summarised line per
  earlier chapter from the digest hierarchy
  ([`src/services/generation/digestContext.ts`](../../../src/services/generation/digestContext.ts)).
  Before this, chapters older than that window were dropped, not summarised.
- **Story bible docs** — already budget-capped via `STORY_DOC_BUDGET_TOKENS`.

## Re-measuring

```bash
npx vite-node scripts/ml-pipelines/potato-profile/probe-ollama.js
```

Writes `reports/ollama-probe.json`. Measurements from the actual server beat
anything in this file or in upstream docs — the `num_ctx` behaviour above was
version-stale in two separate directions before it was probed directly.
