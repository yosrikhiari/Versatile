/**
 * Role placement: which model runs each agent role, and on which device.
 *
 * The generation pipeline has four LLM roles — the Director plans, the Writer
 * drafts prose, the Critic judges a draft, the Editor decides what to do next —
 * plus `utility` for the short structured calls (metadata, spine, titles).
 * Until now every role ran on the one prose/utility pair from `config/ollama.ts`.
 *
 * Two facts about an 8 GB GPU shaped this table (measured 2026-09-18 on an
 * RTX 4060 Laptop, Ollama 0.34, `D:/models`):
 *
 *   - `qwen3:8b` alone takes 5.6 GB at 4k context and 6.2 GB at 8k. Loading a
 *     second model on the GPU EVICTS the first, even a 3B one; every switch
 *     costs 12–18 s of reload. A Writer and a Critic that alternate per scene
 *     on two GPU models would spend more time loading than generating.
 *   - A small model with `num_gpu: 0` runs on the CPU (11 tok/s for a 3B on 16
 *     threads) while the GPU model stays resident, and the two generate at the
 *     same time.
 *
 * So the rule the table enforces: at most ONE distinct model on the `gpu`
 * device per run. Roles that share the GPU share its model and never swap;
 * roles that must differ from the Writer (the Critic, so the judge is not the
 * author — Zheng et al. 2023's self-enhancement bias) go on the `cpu` device
 * and overlap with writing instead of queueing behind it.
 *
 * `model: null` means "inherit": `writer`/`director` inherit the prose model,
 * `critic`/`editor`/`utility` inherit the utility model. Persisted per role in
 * localStorage like the other Ollama settings; `resolveRolePlacement` is the
 * only reader.
 */
import { STORAGE_KEYS } from './storageKeys'
import { getOllamaModel, getOllamaUtilityModel } from './ollama'

export type RoleName = 'director' | 'writer' | 'critic' | 'editor' | 'utility'
export type RoleDevice = 'gpu' | 'cpu'

export interface RolePlacement {
  /** Ollama model tag, or null to inherit the prose/utility default. */
  model: string | null
  device: RoleDevice
  /** Context window requested for this role; null = the global num_ctx. */
  numCtx: number | null
  /** How long Ollama keeps the model loaded after a call (Ollama duration string). */
  keepAlive: string
}

export const ROLE_NAMES: RoleName[] = ['director', 'writer', 'critic', 'editor', 'utility']

/**
 * Defaults are deliberately conservative: everything on the GPU on the prose /
 * utility models, i.e. exactly today's behaviour. Moving the Critic and Editor
 * to a small CPU model is a Settings choice (or the multi-agent preset below),
 * because it needs a model pulled that this machine may not have.
 */
export const DEFAULT_ROLE_PLACEMENT: Record<RoleName, RolePlacement> = {
  director: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' },
  writer: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' },
  critic: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' },
  editor: { model: null, device: 'gpu', numCtx: 4096, keepAlive: '30m' },
  utility: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' }
}

/**
 * The multi-agent preset: Writer and Director stay on the GPU prose model;
 * Critic and Editor run a different, small model on the CPU. The model names
 * are what was on this machine when the preset was written — Settings lets the
 * user pick any pulled model per role.
 */
export const MULTI_AGENT_PRESET: Record<RoleName, RolePlacement> = {
  director: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' },
  writer: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' },
  critic: { model: 'qwen2.5:3b-instruct', device: 'cpu', numCtx: 8192, keepAlive: '30m' },
  editor: { model: 'qwen2.5:3b-instruct', device: 'cpu', numCtx: 4096, keepAlive: '30m' },
  utility: { model: null, device: 'gpu', numCtx: null, keepAlive: '30m' }
}

function storageKey(role: RoleName): string {
  return `${STORAGE_KEYS.ROLE_PLACEMENT_PREFIX}${role}`
}

function readStored(role: RoleName): Partial<RolePlacement> | null {
  try {
    const raw = localStorage.getItem(storageKey(role))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** The stored placement for a role, defaults filled in. Never throws. */
export function getRolePlacement(role: RoleName): RolePlacement {
  const base = DEFAULT_ROLE_PLACEMENT[role]
  const stored = readStored(role)
  if (!stored) return { ...base }
  return {
    model: typeof stored.model === 'string' && stored.model ? stored.model : null,
    device: stored.device === 'cpu' ? 'cpu' : 'gpu',
    numCtx:
      typeof stored.numCtx === 'number' && Number.isFinite(stored.numCtx) && stored.numCtx > 0
        ? stored.numCtx
        : base.numCtx,
    keepAlive:
      typeof stored.keepAlive === 'string' && stored.keepAlive ? stored.keepAlive : base.keepAlive
  }
}

export function setRolePlacement(role: RoleName, placement: Partial<RolePlacement> | null) {
  if (!placement) {
    localStorage.removeItem(storageKey(role))
    return
  }
  const merged = { ...getRolePlacement(role), ...placement }
  localStorage.setItem(storageKey(role), JSON.stringify(merged))
}

export function applyRolePreset(preset: Record<RoleName, RolePlacement>) {
  for (const role of ROLE_NAMES) setRolePlacement(role, preset[role])
}

export function resetRolePlacements() {
  for (const role of ROLE_NAMES) setRolePlacement(role, null)
}

/**
 * The concrete model a role resolves to once inheritance is applied. This is
 * what `aiService` uses; the placement's `model: null` never reaches a call.
 */
export function resolveRoleModel(role: RoleName): string | null {
  const placement = getRolePlacement(role)
  if (placement.model) return placement.model
  if (role === 'writer' || role === 'director') return getOllamaModel() || null
  return getOllamaUtilityModel()
}

/** Everything a call needs to place itself: model, device lane and Ollama options. */
export interface RoleRuntime {
  role: RoleName
  model: string | null
  device: RoleDevice
  lane: `ollama:${RoleDevice}`
  numGpu: number | undefined
  numCtx: number | null
  keepAlive: string
}

export function resolveRolePlacement(role: RoleName): RoleRuntime {
  const placement = getRolePlacement(role)
  return {
    role,
    model: resolveRoleModel(role),
    device: placement.device,
    lane: `ollama:${placement.device}`,
    // `num_gpu: 0` is how Ollama is told to keep a model off the GPU. Left
    // undefined for the GPU device so Ollama's own layer split applies.
    numGpu: placement.device === 'cpu' ? 0 : undefined,
    numCtx: placement.numCtx,
    keepAlive: placement.keepAlive
  }
}

export interface PlacementProblem {
  level: 'error' | 'warning'
  message: string
}

/**
 * The one hard rule (two GPU models would evict each other on every switch)
 * plus the soft ones. A run refuses to start on an `error`; warnings go to the
 * activity log so the user sees why a run is slower than it could be.
 */
export function placementProblems(): PlacementProblem[] {
  const problems: PlacementProblem[] = []
  const gpuModels = new Set<string>()
  for (const role of ROLE_NAMES) {
    const rt = resolveRolePlacement(role)
    if (rt.device === 'gpu' && rt.model) gpuModels.add(rt.model)
  }
  if (gpuModels.size > 1) {
    problems.push({
      level: 'error',
      message:
        `Role placement names ${gpuModels.size} different GPU models (${[...gpuModels].join(', ')}). ` +
        `On this machine a second GPU model evicts the first and every switch reloads from disk ` +
        `(12–18 s measured). Put one of them on the CPU device or make them the same model.`
    })
  }
  const writer = resolveRolePlacement('writer')
  const critic = resolveRolePlacement('critic')
  if (writer.model && critic.model && writer.model === critic.model) {
    problems.push({
      level: 'warning',
      message:
        'The Critic runs the same model as the Writer, so the judge is the author. ' +
        'A different model on the CPU device removes that bias without a swap.'
    })
  }
  return problems
}
