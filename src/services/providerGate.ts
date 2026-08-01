/**
 * One place that decides who is allowed to talk to a provider right now.
 *
 * A local Ollama server is a single box with finite VRAM, not an elastic API.
 * Two callers hitting it at once do not go twice as fast — they evict each
 * other's model and both go an order of magnitude slower. `aiService` already
 * knew this and serialised its own calls behind a semaphore, but that semaphore
 * lived inside `aiService`, so it only ever covered chat/generation traffic.
 * The embedding path fetched `/api/embed` directly and never took a slot, which
 * meant the "one Ollama request at a time" invariant was quietly false the
 * entire time RAG indexing was running: four concurrent 128-input embed batches
 * plus a story stream, all on one server. Embeddings that take ~2s took 270s,
 * and the story stream behind them burned its whole hour-long ceiling.
 *
 * The semaphore therefore lives here, above both callers, and both take slots
 * from it.
 *
 * Serialising is necessary but not sufficient: it makes the calls correct
 * without making them fair. A background re-index with 54 queued batches would
 * still sit in front of the scene the author is waiting on. So this module also
 * carries a foreground marker — generation claims it, background work yields to
 * it — which is priority, a thing a counting semaphore cannot express.
 */

type SemaphoreFn = <T>(fn: () => Promise<T>) => Promise<T>

export function createSemaphore(limit: number): SemaphoreFn {
  let active = 0
  const waiting: Array<() => void> = []

  const pump = (): void => {
    if (active >= limit || waiting.length === 0) return
    active++
    const next = waiting.shift()
    next?.()
  }

  return async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      waiting.push(resolve)
      pump()
    })
    try {
      return await fn()
    } finally {
      active--
      pump()
    }
  }
}

/**
 * Requests in flight per provider.
 *
 * Ollama is 1 because it is one process on one GPU. Hosted providers are
 * network-bound and genuinely parallel, so they get room to overlap.
 */
export const PROVIDER_CONCURRENCY: Record<string, number> = {
  ollama: 1,
  default: 4
}

const semaphores = new Map<string, SemaphoreFn>()

/** Test seam: drop every semaphore so limits are re-read from scratch. */
export function resetSemaphores(): void {
  semaphores.clear()
}

/**
 * INVARIANT: slots do not nest. At limit 1, a caller holding the Ollama slot
 * that waits on another Ollama slot waits forever. In practice this means an
 * embedding must never be issued from inside a generation call — retrieval and
 * cache lookups run before the call, cache writes are fire-and-forget after it.
 * Anything that needs both takes them in sequence, never nested.
 */
export function slotFor(provider: string): SemaphoreFn {
  if (!semaphores.has(provider)) {
    const limit = PROVIDER_CONCURRENCY[provider] ?? PROVIDER_CONCURRENCY.default
    semaphores.set(provider, createSemaphore(limit))
  }
  return semaphores.get(provider)!
}

// --- Foreground priority -------------------------------------------------
//
// Tracked per provider, because the resource being protected is a provider. A
// scene generated against OpenAI contends with nothing on the local GPU, so it
// has no business pausing local indexing — the marker only means something to
// background work on the *same* provider.
//
// A count per provider, not a boolean: generation runs nest (a scene write
// spawns a critic call, which spawns metadata extraction) and any one of them
// finishing must not read as "the run is over" while the others are still going.

const foregroundDepth = new Map<string, number>()
const idleWaiters = new Map<string, Set<() => void>>()

function depthOf(provider: string): number {
  return foregroundDepth.get(provider) || 0
}

function wakeAll(provider: string): void {
  const waiters = idleWaiters.get(provider)
  if (!waiters) return
  for (const wake of [...waiters]) wake()
  waiters.clear()
}

/**
 * Mark the start of user-visible work on a provider. Returns the release
 * function; call it in a `finally` so a thrown scene still releases the marker.
 */
export function beginForegroundWork(provider = 'ollama'): () => void {
  foregroundDepth.set(provider, depthOf(provider) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const next = Math.max(0, depthOf(provider) - 1)
    foregroundDepth.set(provider, next)
    if (next === 0) wakeAll(provider)
  }
}

export function isForegroundBusy(provider = 'ollama'): boolean {
  return depthOf(provider) > 0
}

/**
 * Resolve once no foreground work is in flight on this provider. Background
 * loops await this before each unit of work, so they pause for a generation run
 * and resume by themselves afterwards rather than being cancelled and needing a
 * restart.
 */
export function awaitForegroundIdle(provider = 'ollama', signal?: AbortSignal): Promise<void> {
  if (depthOf(provider) === 0) return Promise.resolve()
  if (signal?.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    if (!idleWaiters.has(provider)) idleWaiters.set(provider, new Set())
    const waiters = idleWaiters.get(provider)!
    const wake = (): void => {
      waiters.delete(wake)
      signal?.removeEventListener('abort', wake)
      resolve()
    }
    waiters.add(wake)
    signal?.addEventListener('abort', wake, { once: true })
  })
}

/** Test seam: drop all foreground markers and wake everything waiting. */
export function resetForegroundWork(): void {
  foregroundDepth.clear()
  for (const provider of [...idleWaiters.keys()]) wakeAll(provider)
  idleWaiters.clear()
}

/**
 * Hold the marker briefly after a call returns.
 *
 * A generation run is not one request, it is dozens with gaps between them:
 * write a scene, critique it, extract metadata, write the next. Releasing on the
 * last token would let a background batch grab the GPU in every one of those
 * gaps, which is most of the damage with none of the throughput. The linger
 * spans the gaps; a genuinely finished run frees the queue this many seconds
 * later, which nobody notices.
 */
const FOREGROUND_LINGER_MS = 30_000

/**
 * Take a provider slot *and* claim foreground priority for the duration.
 *
 * This is what generation calls. Background callers use `slotFor` directly:
 * they still serialise against everything else, they just never claim priority
 * — which is the whole distinction between the two.
 */
export function foregroundSlot(provider: string): SemaphoreFn {
  const slot = slotFor(provider)
  return async function withForegroundSlot<T>(fn: () => Promise<T>): Promise<T> {
    // Claimed before the wait for the slot, not after: a batch that has not
    // started yet should see the marker and yield, rather than starting and
    // making this call wait for it.
    const release = beginForegroundWork(provider)
    try {
      return await slot(fn)
    } finally {
      const timer = setTimeout(release, FOREGROUND_LINGER_MS)
      // Browsers return a number here; Node returns a Timeout. Under Node this
      // pending handle would otherwise keep the process alive for 30s after the
      // last call, which matters for tests and any SSR/CLI use of this module.
      ;(timer as unknown as { unref?: () => void })?.unref?.()
    }
  }
}
