import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorage } from '../utils/useLocalStorage'

/**
 * Scene / chapter templates (Templater analog, roadmap Phase 6). A template
 * is a title, a set of fields the writer fills, a body with `{{field}}`
 * placeholders, and a mapping from fields to the scene-context columns
 * (schema v49) so inserting a template also sets POV / location / cast on
 * the scene. Built-ins ship; the writer's own templates live in
 * localStorage under `versatile.templates`.
 */
export interface TemplateField {
  key: string
  label: string
  placeholder?: string
  /** Which scene-context column this field also writes, if any. */
  metadata?: 'pov' | 'location' | 'charactersPresent'
}

export interface StoryTemplate {
  id: string
  title: string
  description: string
  fields: TemplateField[]
  body: string
  builtIn?: boolean
}

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Substitute `{{key}}`; unknown keys become empty, not literal braces. */
export function renderTemplate(body: string, values: Record<string, string | undefined>): string {
  return String(body || '').replace(PLACEHOLDER_RE, (_m, key: string) => {
    const v = values?.[key]
    return v == null ? '' : String(v)
  })
}

/** The scene-context patch a filled template implies. */
export function metadataFromFields(
  fields: TemplateField[],
  values: Record<string, string | undefined>
): { pov?: string; location?: string; charactersPresent?: string[] } {
  const out: { pov?: string; location?: string; charactersPresent?: string[] } = {}
  for (const f of fields || []) {
    const v = (values?.[f.key] || '').trim()
    if (!v || !f.metadata) continue
    if (f.metadata === 'charactersPresent') {
      out.charactersPresent = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      out[f.metadata] = v
    }
  }
  return out
}

export const BUILT_IN_TEMPLATES: StoryTemplate[] = [
  {
    id: 'scene',
    title: 'Scene',
    description:
      'POV, setting, goal, conflict — the four lines a scene needs before its first sentence.',
    fields: [
      { key: 'pov', label: 'POV character', placeholder: 'Whose eyes', metadata: 'pov' },
      { key: 'setting', label: 'Setting', placeholder: 'Where, when', metadata: 'location' },
      {
        key: 'cast',
        label: 'Also present',
        placeholder: 'Names, comma-separated',
        metadata: 'charactersPresent'
      },
      { key: 'goal', label: 'What {{pov}} wants', placeholder: 'The concrete want' },
      { key: 'conflict', label: 'What stands in the way', placeholder: 'Person, place or fact' }
    ],
    body: '{{pov}} — {{setting}}.\n\nWants: {{goal}}\nAgainst: {{conflict}}\n\n',
    builtIn: true
  },
  {
    id: 'chapter-opener',
    title: 'Chapter opener',
    description:
      'Ground the reader in the first paragraph: place, time, who, and the thing that is wrong.',
    fields: [
      { key: 'pov', label: 'POV character', metadata: 'pov' },
      { key: 'setting', label: 'Setting', metadata: 'location' },
      {
        key: 'time',
        label: 'Time since last chapter',
        placeholder: 'the next morning / three weeks later'
      },
      { key: 'wrong', label: 'The thing that is wrong', placeholder: 'Concrete and visible' }
    ],
    body: '{{time}}. {{setting}}. {{pov}} noticed {{wrong}}.\n\n',
    builtIn: true
  },
  {
    id: 'climax',
    title: 'Climax',
    description: 'The scene where the protagonist can no longer avoid the choice.',
    fields: [
      { key: 'pov', label: 'POV character', metadata: 'pov' },
      { key: 'setting', label: 'Setting', metadata: 'location' },
      { key: 'choice', label: 'The choice', placeholder: 'A or B — both cost something' },
      { key: 'cost', label: 'What it costs', placeholder: 'Named, not vague' }
    ],
    body: '{{pov}} — {{setting}}.\n\nThe choice: {{choice}}\nThe cost: {{cost}}\n\n',
    builtIn: true
  }
]

export const useTemplatesStore = defineStore('templates', () => {
  const custom = useLocalStorage<StoryTemplate[]>('versatile.templates', [])

  const templates = computed<StoryTemplate[]>(() => [
    ...BUILT_IN_TEMPLATES,
    ...(Array.isArray(custom.value) ? custom.value : [])
  ])

  const lastUsedId = ref<string | null>(null)

  function byId(id: string): StoryTemplate | undefined {
    return templates.value.find((t) => t.id === id)
  }

  function saveCustom(template: Omit<StoryTemplate, 'builtIn' | 'id'> & { id?: string }) {
    const id = template.id || `custom-${Date.now().toString(36)}`
    const next = (Array.isArray(custom.value) ? custom.value : []).filter((t) => t.id !== id)
    next.push({ ...template, id, builtIn: false })
    custom.value = next
    return id
  }

  function removeCustom(id: string) {
    custom.value = (Array.isArray(custom.value) ? custom.value : []).filter((t) => t.id !== id)
  }

  /** Fill a template: the text to insert and the scene-context patch it implies. */
  function fill(id: string, values: Record<string, string | undefined>) {
    const t = byId(id)
    if (!t) return null
    lastUsedId.value = id
    return { text: renderTemplate(t.body, values), metadata: metadataFromFields(t.fields, values) }
  }

  return { templates, custom, lastUsedId, byId, saveCustom, removeCustom, fill }
})
