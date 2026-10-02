import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// #67 / UX-AUDIT #63: one New-project dialog for the workspace and the editor
// menu. It replaced the onboarding wizard, which was the only place to choose
// a project type or blueprint and left the URL on the previous project.

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const createNewProject = vi.fn(async () => 7)
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ createNewProject }) }))
const addCharacterData = vi.fn(async () => 1)
vi.mock('@/stores/storyBibleStore', () => ({ useStoryBibleStore: () => ({ addCharacterData }) }))

import NewProjectDialog from '@/components/layout/NewProjectDialog.vue'

const $ = (sel) => document.body.querySelector(sel)
const field = (label) =>
  [...document.body.querySelectorAll('label')].find(
    (l) => l.textContent.replace('*', '').trim() === label
  )?.control

async function open() {
  const w = mount(NewProjectDialog, { props: { show: false }, attachTo: document.body })
  await w.setProps({ show: true })
  await flushPromises()
  return w
}

async function type(label, value) {
  const el = field(label)
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit() {
  $('[data-test="new-project-dialog"]').dispatchEvent(new Event('submit'))
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  push.mockClear()
  createNewProject.mockClear()
  addCharacterData.mockClear()
  document.body.innerHTML = ''
})

describe('NewProjectDialog', () => {
  it('creates from the short form and opens the new project by its URL', async () => {
    const w = await open()
    await type('Project name', '  Salt Road  ')
    await type('Genre', 'Historical')
    await submit()
    expect(createNewProject).toHaveBeenCalledWith('Salt Road', 'creative', '', null, 'Historical')
    expect(addCharacterData).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/editor/7')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('created')[0]).toEqual([7])
  })

  it('will not create without a name', async () => {
    await open()
    await submit()
    expect(createNewProject).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps the wizard choices under More options, all optional', async () => {
    await open()
    expect($('[data-test="new-project-options"]')).toBeNull()
    $('[data-test="new-project-more"]').click()
    await flushPromises()
    expect($('[data-test="new-project-options"]')).not.toBeNull()

    // Screenplay, its blueprint, a synopsis and a first character.
    ;[...document.body.querySelectorAll('[role="radio"]')]
      .find((b) => b.textContent.includes('Screenplay'))
      .click()
    await flushPromises()
    const blueprint = field('Blueprint')
    blueprint.value = blueprint.options[1].value
    blueprint.dispatchEvent(new Event('change'))
    await type('Project name', 'Night Shift')
    await type('Synopsis', 'A nurse and a ghost.')
    await type('First character', 'Mara')
    await submit()

    expect(createNewProject).toHaveBeenCalledWith(
      'Night Shift',
      'screenplay',
      'A nurse and a ghost.',
      blueprint.options[1].value,
      ''
    )
    expect(addCharacterData).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: 'Mara', role: 'Protagonist' })
    )
    expect(push).toHaveBeenCalledWith('/editor/7')
  })

  it('drops a blueprint chosen for another type', async () => {
    await open()
    $('[data-test="new-project-more"]').click()
    await flushPromises()
    const blueprint = field('Blueprint')
    blueprint.value = blueprint.options[1].value
    blueprint.dispatchEvent(new Event('change'))
    ;[...document.body.querySelectorAll('[role="radio"]')]
      .find((b) => b.textContent.includes('Novel'))
      .click()
    await flushPromises()
    await type('Project name', 'X')
    await submit()
    expect(createNewProject.mock.calls[0][3]).toBeNull()
  })

  it('stays open and says so when creating fails', async () => {
    createNewProject.mockRejectedValueOnce(new Error('disk full'))
    const w = await open()
    await type('Project name', 'Lost')
    await submit()
    expect(push).not.toHaveBeenCalled()
    expect(w.emitted('close')).toBeUndefined()
    expect($('[role="alert"]').textContent).toContain('could not be created')
  })

  it('opens empty each time', async () => {
    const w = await open()
    await type('Project name', 'Draft')
    await w.setProps({ show: false })
    await w.setProps({ show: true })
    await flushPromises()
    expect(field('Project name').value).toBe('')
  })
})

describe('blueprints the dialog offers', () => {
  it('carry no mis-decoded punctuation into chapter titles', async () => {
    // "Act I ΓÇö The Setup": UTF-8 em dashes read as code page 437 (31 of them).
    const { BLUEPRINTS } = await import('@/config/blueprints')
    const text = JSON.stringify(BLUEPRINTS)
    expect(text).not.toMatch(/ΓÇ/)
    expect(text).toContain('Act I — The Setup')
  })
})
