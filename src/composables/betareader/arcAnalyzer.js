import { aiGenerateJson } from '../useAiService'

const ARC_SCHEMA = {
  type: 'object',
  properties: {
    pacing: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'number' },
          pace: { type: 'string', enum: ['slow', 'steady', 'fast', 'intense'] },
          note: { type: 'string' }
        },
        required: ['sceneNumber', 'pace', 'note']
      }
    },
    setupPayoffs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['warning', 'info'] },
          setupScene: { type: 'number' },
          payoffScene: { type: 'number' },
          element: { type: 'string' },
          status: { type: 'string', enum: ['paid_off', 'unresolved', 'orphaned'] },
          description: { type: 'string' }
        },
        required: ['severity', 'element', 'status', 'description']
      }
    },
    droppedThreads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['error', 'warning'] },
          thread: { type: 'string' },
          introducedIn: { type: 'number' },
          lastMentioned: { type: 'number' },
          description: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['severity', 'thread', 'introducedIn', 'lastMentioned', 'description']
      }
    }
  },
  required: ['pacing', 'setupPayoffs', 'droppedThreads']
}

const ARC_PROMPT = `You are a narrative structure analyst for fiction manuscripts.
Analyze the full manuscript and produce three analyses:

1. PACING: For each scene, classify its pace (slow/steady/fast/intense) and note why.
2. SETUP & PAYOFF: Track promises the story makes (foreshadowing, Chekhov's guns, character arcs) and whether they pay off. Flag orphaned setups (introduced but never resolved) as severity "warning", resolved ones as "info".
3. DROPPED THREADS: Plot threads, subplots, character arcs, mysteries, or questions introduced but never revisited or resolved. These are severity "error" if critical to the main plot, "warning" if minor.

Respond ONLY with valid JSON matching the schema.`

export async function analyzeArc(scenes, aiOptions) {
  const scenesText = scenes
    .map((s) => `Scene ${s.sceneNumber} ("${s.title}"):\n${s.content}`)
    .join('\n\n---\n\n')

  const prompt = `Full manuscript (${scenes.length} scenes):\n\n${scenesText}`
  const parsed = await aiGenerateJson(prompt, ARC_PROMPT, {
    ...aiOptions,
    schema: ARC_SCHEMA,
    schemaName: 'arc_analysis'
  }).catch(() => null)

  if (!parsed) {
    return { pacing: [], setupPayoffs: [], droppedThreads: [] }
  }

  const sceneById = {}
  for (const s of scenes) {
    sceneById[s.sceneNumber] = s
  }

  const setupPayoffs = (parsed.setupPayoffs || []).map((sp, i) => ({
    id: `arc-sp-${i}`,
    severity: sp.severity,
    category: sp.status === 'paid_off' ? 'setup_payoff' : 'orphaned_setup',
    pass: 'arc',
    title: `${sp.element} — ${sp.status === 'paid_off' ? 'Paid Off' : 'Unresolved'}`,
    description: sp.description,
    action:
      sp.status !== 'paid_off' && sceneById[sp.setupScene]
        ? {
            label: 'View Setup',
            type: 'open-section',
            payload: { subsectionId: sceneById[sp.setupScene].id },
            sceneId: sceneById[sp.setupScene].id
          }
        : null
  }))

  const droppedThreads = (parsed.droppedThreads || []).map((dt, i) => ({
    id: `arc-dt-${i}`,
    severity: dt.severity,
    category: 'dropped_thread',
    pass: 'arc',
    title: dt.thread,
    description: dt.description + (dt.suggestion ? ` Suggestion: ${dt.suggestion}` : ''),
    action: sceneById[dt.introducedIn]
      ? {
          label: 'View Introduction',
          type: 'open-section',
          payload: { subsectionId: sceneById[dt.introducedIn].id },
          sceneId: sceneById[dt.introducedIn].id
        }
      : null
  }))

  const pacing = (parsed.pacing || []).map((p, i) => ({
    id: `arc-pace-${i}`,
    severity: p.pace === 'slow' ? 'info' : p.pace === 'intense' ? 'info' : 'info',
    category: 'pacing',
    pass: 'arc',
    title: `Scene ${p.sceneNumber}: ${p.pace}`,
    description: p.note,
    action: sceneById[p.sceneNumber]
      ? {
          label: 'Jump to Scene',
          type: 'open-section',
          payload: { subsectionId: sceneById[p.sceneNumber].id },
          sceneId: sceneById[p.sceneNumber].id
        }
      : null
  }))

  return {
    pacing,
    setupPayoffs,
    droppedThreads,
    all: [...pacing, ...setupPayoffs, ...droppedThreads]
  }
}
