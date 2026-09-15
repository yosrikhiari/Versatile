// How many recent scenes stay in the writer's log at full detail. Chapters that
// fall entirely outside this window are carried by their digests instead — the
// boundary has to be one number, or the two blocks overlap or leave a gap.
export const RECENT_SCENE_LOG_LIMIT = 20
export const PARALLEL_SCENE_LIMIT = 2
// One-click quality guardrails: rewrite a scene that fails critique up to this
// many times, and abort the whole run if this many scenes fail back-to-back
// (signals a broken model/critic rather than letting it churn out garbage).
export const SCENE_MAX_ATTEMPTS = 2
export const QUALITY_FLOOR_CONSECUTIVE = 3
// Consecutive scenes that may fail to produce ANY prose before the run gives up.
// Distinct from the quality floor above: that judges prose the model wrote, this
// catches a pipeline that is not writing prose at all.
export const WRITE_FAILURE_STREAK_ABORT = 4
