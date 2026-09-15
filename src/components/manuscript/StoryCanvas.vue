<script setup>
import BaseButton from '../ui/BaseButton.vue'
import { ref, computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import { useNotifications } from '../../composables/useNotifications'
import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import draggable from 'vuedraggable'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { getProject, updateProjectMeta } from '../../services/db-projects'
import {
  buildPins,
  toNormalized,
  autoPlaceCoordinates,
  entityHasCoords
} from '../../utils/canvasCoords'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const bibleStore = useStoryBibleStore()
useDraggableList()
const { showConfirm, addToast } = useNotifications()

// ── Map view (roadmap Phase 8) ─────────────────────────────────────────────
// A background image on the project row (`mapBackground`, a data URL) and
// entity pins stored as `metadata.mapX` / `metadata.mapY` in 0..1 — Phase-1
// metadata, so nothing here needs a schema.
const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'map', label: 'Map' }
]
const view = ref('board')
const mapBackground = ref(null)
const mapEl = ref(null)
const pinning = ref(null) // { kind, id, name } waiting for a click on the map
const draggingPin = ref(null)
const PIN_COLORS = {
  character: 'var(--vers-element-character)',
  location: 'var(--vers-element-location)',
  plotThread: 'var(--vers-element-plotpoint)'
}

const pins = computed(() =>
  buildPins(
    {
      characters: bibleStore.characters,
      locations: bibleStore.locations,
      plotThreads: bibleStore.plotThreads
    },
    PIN_COLORS
  )
)
const unpinned = computed(() => [
  ...bibleStore.locations
    .filter((e) => !entityHasCoords(e))
    .map((e) => ({ kind: 'location', id: e.id, name: e.name })),
  ...bibleStore.characters
    .filter((e) => !entityHasCoords(e))
    .map((e) => ({ kind: 'character', id: e.id, name: e.name }))
])
const unpinnedLocations = computed(() => bibleStore.locations.filter((e) => !entityHasCoords(e)))

async function loadMapBackground() {
  if (!projectStore.currentProjectId) return
  const p = await getProject(projectStore.currentProjectId).catch(() => null)
  mapBackground.value = p?.mapBackground || null
}

function onMapImagePicked(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  if (!/^image\//.test(file.type)) {
    addToast('Choose an image file for the map', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    mapBackground.value = String(reader.result)
    if (projectStore.currentProjectId) {
      await updateProjectMeta(projectStore.currentProjectId, { mapBackground: mapBackground.value })
    }
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

async function clearMapBackground() {
  mapBackground.value = null
  if (projectStore.currentProjectId) {
    await updateProjectMeta(projectStore.currentProjectId, { mapBackground: null })
  }
}

async function setPin(kind, id, x, y) {
  await bibleStore.setEntityMeta(kind, id, 'mapX', x)
  await bibleStore.setEntityMeta(kind, id, 'mapY', y)
}

async function onMapClick(event) {
  if (!pinning.value || !mapEl.value) return
  const pos = toNormalized(event.clientX, event.clientY, mapEl.value.getBoundingClientRect())
  if (!pos) return
  const { kind, id } = pinning.value
  pinning.value = null
  await setPin(kind, id, pos.x, pos.y)
}

function startPinDrag(pin, event) {
  draggingPin.value = pin
  event.preventDefault()
}
async function onMapPointerMove(event) {
  if (!draggingPin.value || !mapEl.value) return
  const pos = toNormalized(event.clientX, event.clientY, mapEl.value.getBoundingClientRect())
  if (!pos) return
  // Move the visible pin now; the store write lands on release.
  draggingPin.value = { ...draggingPin.value, x: pos.x, y: pos.y }
}
async function onMapPointerUp() {
  const pin = draggingPin.value
  draggingPin.value = null
  if (!pin) return
  await setPin(pin.kind, pin.id, pin.x, pin.y)
}
function pinStyle(pin) {
  const live =
    draggingPin.value?.id === pin.id && draggingPin.value?.kind === pin.kind
      ? draggingPin.value
      : pin
  return { left: `${live.x * 100}%`, top: `${live.y * 100}%`, '--pin-color': pin.color }
}

async function unpin(pin) {
  await bibleStore.setEntityMeta(pin.kind, pin.id, 'mapX', null)
  await bibleStore.setEntityMeta(pin.kind, pin.id, 'mapY', null)
}

async function pinAllLocations() {
  const targets = unpinnedLocations.value
  const coords = autoPlaceCoordinates(targets.length)
  for (let i = 0; i < targets.length; i++) {
    await setPin('location', targets[i].id, coords[i].x, coords[i].y)
  }
  if (targets.length)
    addToast(
      `Placed ${targets.length} location${targets.length === 1 ? '' : 's'} — drag them into place`,
      'success'
    )
}

const selectedElement = ref(null)
const showAddModal = ref(false)
const newElementTitle = ref('')
const newElementType = ref('section')

const elementTypes = [
  {
    value: 'section',
    label: 'Section',
    color: 'var(--vers-element-section)',
    iconName: 'book-open'
  },
  {
    value: 'character',
    label: 'Character',
    color: 'var(--vers-element-character)',
    iconName: 'user'
  },
  {
    value: 'location',
    label: 'Location',
    color: 'var(--vers-element-location)',
    iconName: 'map-pin'
  },
  {
    value: 'plotpoint',
    label: 'Plot Point',
    color: 'var(--vers-element-plotpoint)',
    iconName: 'zap'
  },
  { value: 'note', label: 'Note', color: 'var(--vers-element-note)', iconName: 'file-text' }
]

const storyDragOptions = {
  ...DRAG_OPTIONS,
  group: 'story-elements'
}

const canvasDragOptions = {
  ...DRAG_OPTIONS,
  group: { name: 'canvas', pull: 'clone', put: false }
}

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'
}))

function getElementIconName(type) {
  return elementTypes.find((t) => t.value === type)?.iconName || 'file'
}

function getElementColor(type) {
  return elementTypes.find((t) => t.value === type)?.color || 'var(--vers-default-fallback)'
}

function selectElement(element) {
  selectedElement.value = element
}

function addNewElement() {
  if (!newElementTitle.value.trim()) return

  const colors = [
    'var(--vers-element-section)',
    'var(--vers-element-character)',
    'var(--vers-element-location)',
    'var(--vers-element-plotpoint)',
    'var(--vers-element-note)'
  ]
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  manuscriptStore.addStoryElementData(projectStore.currentProjectId, {
    type: newElementType.value,
    title: newElementTitle.value,
    x: Math.random() * 100,
    y: Math.random() * 100,
    width: 200,
    height: 100,
    data: { color: randomColor }
  })

  newElementTitle.value = ''
  showAddModal.value = false
}

/**
 * Persist a canvas change made by dragging.
 *
 * vuedraggable mutates the bound array in place, and nothing was listening — so
 * a section dragged onto the canvas, and any reordering, lived only in memory
 * and was gone on the next load. `added` covers the clone dropped in from
 * "Quick Add from Document"; `moved` covers rearranging what is already there.
 */
async function onCanvasChange(event) {
  const projectId = projectStore.currentProjectId
  if (!projectId) return

  if (event.added) {
    const el = event.added.element
    // The drag clone carries a synthetic `section-<id>` string id; the row needs
    // a real one, so insert it and swap the placeholder for the stored record.
    const index = manuscriptStore.storyElements.indexOf(el)
    if (index !== -1) manuscriptStore.storyElements.splice(index, 1)
    await manuscriptStore.addStoryElementData(projectId, {
      type: el.type || 'section',
      title: el.title || 'Untitled',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      data: { ...(el.data || {}), sourceType: el.type || 'section', sourceId: el.data?.sectionId }
    })
    return
  }

  if (event.moved) {
    // Order is the array's own order; persist it as `order` so a reload restores
    // the arrangement rather than falling back to insertion order.
    await Promise.all(
      manuscriptStore.storyElements.map((el, i) =>
        el.order === i
          ? Promise.resolve()
          : manuscriptStore.updateStoryElementData(el.id, { order: i }, projectId)
      )
    )
  }
}

async function deleteElement(element) {
  if (await showConfirm('Delete Element', 'Delete this element?', 'Delete', 'danger')) {
    manuscriptStore.deleteStoryElementData(element.id, projectStore.currentProjectId)
    if (selectedElement.value?.id === element.id) {
      selectedElement.value = null
    }
  }
}

onMounted(loadMapBackground)
onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary overflow-hidden">
    <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
      <h2 class="font-ui text-sm font-semibold text-text-primary">Story canvas</h2>
      <BaseSegmented v-model="view" :options="VIEWS" size="sm" aria-label="Canvas view" />
      <BaseButton
        v-if="view === 'board'"
        variant="soft"
        size="sm"
        icon="plus"
        @click="showAddModal = true"
        >Add element</BaseButton
      >
      <BaseButton
        v-else
        variant="soft"
        size="sm"
        icon="map-pin"
        :disabled="!unpinnedLocations.length"
        :title="
          unpinnedLocations.length
            ? 'Place every unpinned location on the map'
            : 'Every location is pinned'
        "
        data-test="pin-all-locations"
        @click="pinAllLocations"
        >Pin all locations</BaseButton
      >
    </div>

    <!-- ── Map view ─────────────────────────────────────────────────── -->
    <div
      v-if="view === 'map'"
      class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4"
      data-test="map-view"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="inline-flex">
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            data-test="map-image"
            @change="onMapImagePicked"
          />
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-subtle bg-bg-secondary text-text-primary font-ui text-xs cursor-pointer hover:border-accent"
          >
            <BaseIcon name="image" :size="12" />
            {{ mapBackground ? 'Replace map image' : 'Upload a map image' }}
          </span>
        </label>
        <BaseButton v-if="mapBackground" variant="ghost" size="sm" @click="clearMapBackground"
          >Remove image</BaseButton
        >
        <span class="flex-1"></span>
        <label
          v-if="unpinned.length"
          class="flex items-center gap-1.5 font-ui text-xs text-text-hint"
        >
          Pin
          <select
            class="bg-bg-secondary text-text-primary text-xs font-ui rounded px-2 py-1"
            aria-label="Entity to pin"
            data-test="pin-select"
            :value="pinning ? `${pinning.kind}:${pinning.id}` : ''"
            @change="
              (e) => {
                const [kind, id] = e.target.value.split(':')
                pinning = id
                  ? {
                      kind,
                      id,
                      name: unpinned.find((u) => String(u.id) === id && u.kind === kind)?.name
                    }
                  : null
              }
            "
          >
            <option value="">choose…</option>
            <option v-for="u in unpinned" :key="`${u.kind}:${u.id}`" :value="`${u.kind}:${u.id}`">
              {{ u.name }} ({{ u.kind === 'plotThread' ? 'thread' : u.kind }})
            </option>
          </select>
          <span v-if="pinning" class="text-accent">then click the map</span>
        </label>
      </div>

      <div
        ref="mapEl"
        class="relative w-full rounded-lg border border-border-subtle bg-bg-tertiary overflow-hidden select-none"
        :class="pinning ? 'cursor-crosshair' : ''"
        :style="{ aspectRatio: '16 / 10' }"
        data-test="map"
        @click="onMapClick"
        @pointermove="onMapPointerMove"
        @pointerup="onMapPointerUp"
        @pointerleave="onMapPointerUp"
      >
        <img
          v-if="mapBackground"
          :src="mapBackground"
          alt=""
          class="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
        <div
          v-else
          class="absolute inset-0 grid place-items-center font-ui text-xs text-text-hint px-6 text-center leading-5"
        >
          No map image yet. Upload one, or pin entities on the blank board — positions are kept
          either way.
        </div>
        <button
          v-for="pin in pins"
          :key="`${pin.kind}:${pin.id}`"
          type="button"
          class="map-pin absolute -translate-x-1/2 -translate-y-full flex flex-col items-center cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          :style="pinStyle(pin)"
          :title="`${pin.name} — drag to move, double-click to unpin`"
          :data-test="`pin-${pin.kind}-${pin.id}`"
          @pointerdown="startPinDrag(pin, $event)"
          @click.stop
          @dblclick.stop="unpin(pin)"
        >
          <span
            class="px-1.5 py-0.5 rounded bg-bg-elevated/90 border border-border-subtle font-ui text-[11px] text-text-primary whitespace-nowrap shadow-sm"
          >
            {{ pin.name }}
          </span>
          <BaseIcon name="map-pin" :size="16" class="map-pin-icon" />
        </button>
      </div>
      <p class="mt-2 font-ui text-[11px] text-text-hint">
        {{ pins.length }} pinned · drag a pin to move it · double-click a pin to remove it.
      </p>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
      <div class="mb-4 flex gap-2 flex-wrap">
        <button
          v-for="type in elementTypes"
          :key="type.value"
          :class="[
            'px-3 py-1 text-xs rounded-full border font-ui',
            newElementType === type.value
              ? 'border-accent bg-surface-hover text-accent'
              : 'border-border-subtle text-text-hint hover:border-text-hint'
          ]"
          :style="newElementType === type.value ? { borderColor: type.color } : {}"
          @click="newElementType = type.value"
        >
          {{ type.icon }} {{ type.label }}
        </button>
      </div>

      <div class="mb-4 p-3 bg-surface-hover rounded-lg">
        <div class="label-micro text-text-hint mb-2">Quick add from the manuscript</div>
        <draggable
          :list="manuscriptStore.sortedSections"
          item-key="id"
          v-bind="canvasDragOptions"
          :clone="
            (el) => ({
              id: `section-${el.id}`,
              type: 'section',
              title: el.title || `Section ${el.order + 1}`,
              data: { sectionId: el.id }
            })
          "
          class="flex gap-2 flex-wrap"
        >
          <template #item="{ element }">
            <div
              class="px-3 py-2 bg-bg-tertiary rounded border border-border-subtle text-sm font-ui cursor-grab hover:border-accent"
            >
              <BaseIcon name="book-open" :size="14" class="inline mr-1" />{{
                element.title || `Section ${element.order + 1}`
              }}
            </div>
          </template>
        </draggable>
      </div>

      <div class="label-micro text-text-hint mb-3">Board · drag to reorder</div>

      <draggable
        :list="manuscriptStore.storyElements"
        item-key="id"
        v-bind="storyDragOptions"
        :style="gridStyle"
        class="min-h-[200px] gap-3 p-4"
        @change="onCanvasChange"
      >
        <template #item="{ element }">
          <div
            :class="[
              'p-3 rounded-lg border-2 border-l-4 cursor-pointer transition-all',
              selectedElement?.id === element.id
                ? 'border-accent shadow-lg scale-[1.02]'
                : 'border-border-subtle hover:border-accent'
            ]"
            :style="{ borderLeftColor: getElementColor(element.type) }"
            @click="selectElement(element)"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <BaseIcon
                  :name="getElementIconName(element.type)"
                  :size="18"
                  :style="{ color: getElementColor(element.type) }"
                />
                <span class="font-semibold text-sm text-text-primary font-ui">{{
                  element.title
                }}</span>
              </div>
              <button
                class="text-text-hint hover:text-danger"
                title="Delete element"
                @click.stop="deleteElement(element)"
              >
                <BaseIcon name="x" :size="14" />
              </button>
            </div>
            <div class="mt-2 text-xs text-text-hint capitalize font-ui">
              {{ element.type === 'section' ? 'section' : element.type }}
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="manuscriptStore.storyElements.length === 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm">
          No elements yet. Add elements or drag sections from above.
        </p>
      </div>
    </div>

    <Modal :show="showAddModal" @close="showAddModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">Add Story Element</h3>
        <input
          v-model="newElementTitle"
          type="text"
          placeholder="Element title..."
          class="w-full px-3 py-2 border border-border-subtle rounded-lg mb-4 bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @keyup.enter="addNewElement"
        />
        <div class="flex gap-2 mb-4">
          <button
            v-for="type in elementTypes"
            :key="type.value"
            :class="[
              'flex-1 px-2 py-1 text-xs rounded border font-ui',
              newElementType === type.value
                ? 'border-accent bg-surface-hover text-accent'
                : 'border-border-subtle text-text-hint'
            ]"
            @click="newElementType = type.value"
          >
            {{ type.icon }}
          </button>
        </div>
        <div class="flex gap-2">
          <button
            :disabled="!newElementTitle.trim()"
            class="flex-1 py-2 btn-primary rounded-lg disabled:opacity-50 font-ui"
            @click="addNewElement"
          >
            Add
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showAddModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.map-pin-icon {
  color: var(--pin-color, var(--vers-accent));
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}
.map-pin:active {
  cursor: grabbing;
}
.ghost {
  @apply opacity-50 rounded-lg;
  background: var(--vers-accent-primary);
}
.drag {
  @apply opacity-90;
  transform: rotate(2deg);
}
</style>
