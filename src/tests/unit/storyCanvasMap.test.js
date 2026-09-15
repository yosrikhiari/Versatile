import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import {
  normalizeCoord,
  toNormalized,
  entityHasCoords,
  buildPins,
  autoPlaceCoordinates
} from '@/utils/canvasCoords'

const dbProjects = vi.hoisted(() => ({
  getProject: vi.fn(async () => ({ id: 'p1', mapBackground: null })),
  updateProjectMeta: vi.fn(async () => 1)
}))
vi.mock('@/services/db-projects', async (orig) => ({
  ...(await orig()),
  getProject: (...a) => dbProjects.getProject(...a),
  updateProjectMeta: (...a) => dbProjects.updateProjectMeta(...a)
}))

import StoryCanvas from '@/components/manuscript/StoryCanvas.vue'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useProjectStore } from '@/stores/projectStore'

describe('canvasCoords (pure)', () => {
  it('normalizes and clamps coordinates', () => {
    expect(normalizeCoord(0.5)).toBe(0.5)
    expect(normalizeCoord('0.25')).toBe(0.25)
    expect(normalizeCoord(1.7)).toBe(1)
    expect(normalizeCoord(-3)).toBe(0)
    expect(normalizeCoord('x')).toBeNull()
    expect(normalizeCoord(undefined)).toBeNull()
  })

  it('maps a click inside a rect to 0..1', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }
    expect(toNormalized(150, 100, rect)).toEqual({ x: 0.25, y: 0.5 })
    expect(toNormalized(10, 10, rect)).toEqual({ x: 0, y: 0 })
    expect(toNormalized(150, 100, { ...rect, width: 0 })).toBeNull()
  })

  it('builds pins only from entities with both coordinates, coloured by kind', () => {
    const pins = buildPins(
      {
        characters: [
          { id: 'c1', name: 'Ines', metadata: { mapX: 0.2, mapY: 0.3 } },
          { id: 'c2', name: 'Tomas', metadata: { mapX: 0.5 } }
        ],
        locations: [{ id: 'l1', name: 'Docks', metadata: { mapX: '0.9', mapY: '0.1' } }],
        plotThreads: []
      },
      { character: 'blue', location: 'green' }
    )
    expect(pins).toEqual([
      { kind: 'character', id: 'c1', name: 'Ines', x: 0.2, y: 0.3, color: 'blue' },
      { kind: 'location', id: 'l1', name: 'Docks', x: 0.9, y: 0.1, color: 'green' }
    ])
    expect(entityHasCoords({ metadata: { mapX: 0.5 } })).toBe(false)
  })

  it('auto-places entities on a grid inside the middle of the map', () => {
    expect(autoPlaceCoordinates(0)).toEqual([])
    const four = autoPlaceCoordinates(4)
    expect(four).toHaveLength(4)
    for (const p of four) {
      expect(p.x).toBeGreaterThanOrEqual(0.1)
      expect(p.x).toBeLessThanOrEqual(0.9)
      expect(p.y).toBeGreaterThanOrEqual(0.1)
      expect(p.y).toBeLessThanOrEqual(0.9)
    }
    expect(new Set(four.map((p) => `${p.x},${p.y}`)).size).toBe(4)
  })
})

describe('StoryCanvas map view', () => {
  const stubs = {
    draggable: {
      template: '<div><slot name="item" v-for="e in list" :element="e" /></div>',
      props: ['list']
    },
    Modal: true,
    BaseIcon: { template: '<i />' }
  }
  let bible
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useProjectStore().currentProjectId = 'p1'
    bible = useStoryBibleStore()
    bible.characters.push({ id: 'c1', name: 'Ines', metadata: { mapX: 0.2, mapY: 0.3 } })
    bible.locations.push({ id: 'l1', name: 'Docks' }, { id: 'l2', name: 'Customs house' })
  })

  async function openMap() {
    const w = mount(StoryCanvas, { global: { stubs } })
    await flushPromises()
    w.vm.view = 'map'
    await flushPromises()
    return w
  }

  it('shows the pinned entities and offers the unpinned ones', async () => {
    const w = await openMap()
    expect(dbProjects.getProject).toHaveBeenCalledWith('p1')
    expect(w.find('[data-test="map-view"]').exists()).toBe(true)
    expect(w.find('[data-test="pin-character-c1"]').exists()).toBe(true)
    expect(w.find('[data-test="pin-character-c1"]').attributes('style')).toContain('left: 20%')
    const options = w.findAll('[data-test="pin-select"] option').map((o) => o.text())
    expect(options.some((t) => t.startsWith('Docks'))).toBe(true)
    expect(options.some((t) => t.startsWith('Customs house'))).toBe(true)
  })

  it('Pin all locations writes coordinates through setEntityMeta for every unpinned location', async () => {
    const setMeta = vi.spyOn(bible, 'setEntityMeta').mockResolvedValue(undefined)
    const w = await openMap()
    await w.find('[data-test="pin-all-locations"]').trigger('click')
    await flushPromises()
    const calls = setMeta.mock.calls.map((c) => c.slice(0, 3).join(':'))
    expect(calls).toEqual([
      'location:l1:mapX',
      'location:l1:mapY',
      'location:l2:mapX',
      'location:l2:mapY'
    ])
    expect(setMeta.mock.calls[0][3]).toBeGreaterThan(0)
  })

  it('choosing an entity then clicking the map pins it at the click', async () => {
    const setMeta = vi.spyOn(bible, 'setEntityMeta').mockResolvedValue(undefined)
    const w = await openMap()
    const select = w.find('[data-test="pin-select"]')
    select.element.value = 'location:l1'
    await select.trigger('change')
    const map = w.find('[data-test="map"]')
    map.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 250 })
    await map.trigger('click', { clientX: 100, clientY: 125 })
    await flushPromises()
    expect(setMeta).toHaveBeenCalledWith('location', 'l1', 'mapX', 0.25)
    expect(setMeta).toHaveBeenCalledWith('location', 'l1', 'mapY', 0.5)
  })

  it('uploading an image persists it on the project row', async () => {
    const w = await openMap()
    const input = w.find('[data-test="map-image"]')
    const file = new File(['x'], 'map.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
    expect(dbProjects.updateProjectMeta).toHaveBeenCalledWith('p1', {
      mapBackground: expect.stringMatching(/^data:image\/png/)
    })
  })
})
