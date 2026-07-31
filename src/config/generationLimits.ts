// Leaf module (no imports) so providers can pull the output default without
// dragging modelRouting — and therefore the settings store — into their tests.

// What every provider used to hardcode as `options.maxTokens || 4096`. Kept as
// the value for models we have no context-window data for, so an unknown model
// behaves exactly as it did before budgets existed.
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096

// Ceiling on a derived max_tokens. Scene generation targets ~800-2000 words
// (~1100-2700 tokens) and useStoryWriter already clamps its own request at 4500,
// so 8192 is generous headroom. It exists to bound a runaway/looping generation,
// not to express what we expect to use.
export const MAX_OUTPUT_TOKENS_CAP = 8192

// Never ask for so little output that the model truncates mid-sentence.
export const MIN_OUTPUT_TOKENS = 1024

// Share of a model's context window we allow assembled input to occupy. The
// remainder covers output plus the chat framing the provider adds.
export const INPUT_BUDGET_RATIO = 0.67

// Applied to whatever context remains after input, so a small estimation error
// cannot push input + max_tokens past the window (a hard 400 from every provider).
export const OUTPUT_HEADROOM_RATIO = 0.85

// Rough estimate: JSON characters per token for schema envelope overhead.
// JSON is ~50% more character-dense than prose (keys, quotes, braces, commas),
// so a tighter ratio than the standard ~4 chars/token matches real-world usage.
export const SCHEMA_OVERHEAD_ESTIMATE_RATIO = 3

// Smallest window in MODEL_META. Assuming the smallest for an unknown model
// under-fills; assuming the largest overflows. Under-filling is the safe error.
export const FALLBACK_CONTEXT_WINDOW = 8192
