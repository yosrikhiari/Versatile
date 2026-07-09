<script setup>
import { ref, computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  characters: {
    type: Array,
    default: () => []
  },
  locations: {
    type: Array,
    default: () => []
  },
  plotThreads: {
    type: Array,
    default: () => []
  },
  existingNodeIds: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'drag-start',
  'quick-add',
  'toggle-sidebar',
  'edit-connection',
  'delete-connection'
])

const searchQuery = ref('')
const expandedSections = ref({
  characters: true,
  locations: true,
  plotThreads: true
})
const expandedEntities = ref({})

const entityColors = {
  character: 'var(--vers-entity-character)',
  location: 'var(--vers-entity-location)',
  plotThread: 'var(--vers-entity-plotThread)'
}

const entityIcons = {
  character: 'user',
  location: 'map-pin',
  plotThread: 'zap'
}

const edgeColors = {
  ally: 'var(--vers-edge-ally)',
  enemy: 'var(--vers-edge-enemy)',
  family: 'var(--vers-edge-family)',
  romantic: 'var(--vers-edge-romantic)',
  mentor: 'var(--vers-edge-mentor)',
  rival: 'var(--vers-edge-rival)',
  neutral: 'var(--vers-edge-neutral)',
  appears_in: 'var(--vers-edge-appears_in)',
  involved_in: 'var(--vers-edge-involved_in)',
  located_at: 'var(--vers-edge-located_at)',
  connects_to: 'var(--vers-edge-connects_to)'
}

function getEntityColor(type) {
  return entityColors[type] || 'var(--vers-default-fallback)'
}

function getEntityIcon(type) {
  return entityIcons[type] || 'circle'
}

function getEdgeColor(type) {
  return edgeColors[type] || 'var(--vers-default-edge)'
}

function getEntityLabel(entity, type) {
  if (type === 'character') return entity.name
  if (type === 'location') return entity.name
  if (type === 'plotThread') return entity.title
  return ''
}

function getEntityConnections(entityType, entityId) {
  const connections = props.edges
    .filter((edge) => {
      const sourceId = String(edge.sourceId)
      const targetId = String(edge.targetId)
      const entityIdStr = String(entityId)
      return (
        (edge.sourceType === entityType && sourceId === entityIdStr) ||
        (edge.targetType === entityType && targetId === entityIdStr)
      )
    })
    .map((edge) => {
      const sourceId = String(edge.sourceId)
      const targetId = String(edge.targetId)
      const entityIdStr = String(entityId)
      const isSource = edge.sourceType === entityType && sourceId === entityIdStr

      let otherType, otherId, otherEntity
      if (isSource) {
        otherType = edge.targetType
        otherId = targetId
      } else {
        otherType = edge.sourceType
        otherId = sourceId
      }

      if (otherType === 'character') {
        otherEntity = props.characters.find((c) => String(c.id) === otherId)
      } else if (otherType === 'location') {
        otherEntity = props.locations.find((l) => String(l.id) === otherId)
      } else if (otherType === 'plotThread') {
        otherEntity = props.plotThreads.find((t) => String(t.id) === otherId)
      }

      return {
        ...edge,
        isSource,
        otherLabel: otherEntity ? getEntityLabel(otherEntity, otherType) : `Unknown ${otherType}`,
        otherType,
        otherColor: getEntityColor(otherType)
      }
    })

  return connections
}

function toggleSection(section) {
  expandedSections.value[section] = !expandedSections.value[section]
}

function toggleEntity(entityId) {
  expandedEntities.value[entityId] = !expandedEntities.value[entityId]
}

function isInNetwork(entityType, entityId) {
  const nodeId = `${entityType === 'character' ? 'char' : entityType === 'location' ? 'loc' : 'thread'}-${entityId}`
  return props.existingNodeIds.includes(nodeId)
}

function handleDragStart(event, entityType, entity) {
  const dragData = {
    type: entityType,
    id: entity.id,
    label: entity.name || entity.title,
    sublabel: entity.role || entity.description?.slice(0, 30) || entity.status
  }
  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.effectAllowed = 'copy'

  const dragImage = event.target.cloneNode(true)
  dragImage.style.position = 'absolute'
  dragImage.style.top = '-9999px'
  dragImage.style.opacity = '0.8'
  dragImage.style.background = 'var(--vers-bg-elevated)'
  dragImage.style.border = `2px solid ${entityColors[entityType] || 'var(--vers-default-fallback)'}`
  dragImage.style.borderRadius = '8px'
  dragImage.style.padding = '8px 12px'
  document.body.appendChild(dragImage)
  event.dataTransfer.setDragImage(dragImage, 50, 20)

  setTimeout(() => document.body.removeChild(dragImage), 0)

  emit('drag-start', dragData)
}

function handleQuickAdd(entityType, entity) {
  if (isInNetwork(entityType, entity.id)) {
    return
  }

  emit('quick-add', {
    type: entityType,
    id: entity.id,
    label: entity.name || entity.title,
    sublabel: entity.role || entity.description?.slice(0, 30) || entity.status
  })
}

function handleEditConnection(edge) {
  emit('edit-connection', edge)
}

function handleDeleteConnection(edge) {
  emit('delete-connection', edge)
}

const filteredCharacters = computed(() => {
  if (!searchQuery.value) return props.characters
  const query = searchQuery.value.toLowerCase()
  return props.characters.filter(
    (c) =>
      c.name?.toLowerCase().includes(query) ||
      c.role?.toLowerCase().includes(query) ||
      c.traits?.some((t) => t.toLowerCase().includes(query))
  )
})

const filteredLocations = computed(() => {
  if (!searchQuery.value) return props.locations
  const query = searchQuery.value.toLowerCase()
  return props.locations.filter(
    (l) =>
      l.name?.toLowerCase().includes(query) ||
      l.description?.toLowerCase().includes(query) ||
      l.traits?.some((t) => t.toLowerCase().includes(query))
  )
})

const filteredPlotThreads = computed(() => {
  if (!searchQuery.value) return props.plotThreads
  const query = searchQuery.value.toLowerCase()
  return props.plotThreads.filter(
    (t) =>
      t.title?.toLowerCase().includes(query) ||
      t.status?.toLowerCase().includes(query) ||
      t.traits?.some((t) => t.toLowerCase().includes(query))
  )
})

const totalEntities = computed(
  () => props.characters.length + props.locations.length + props.plotThreads.length
)

const inNetworkCount = computed(() => props.existingNodeIds.length)
</script>

<template>
  <div
    class="entity-sidebar h-full flex flex-col bg-bg-secondary border-r border-border-subtle overflow-hidden"
  >
    <div class="p-3 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-text-secondary font-ui">Entities</span>
        <button
          class="p-1 text-text-hint hover:text-text-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
          title="Hide sidebar"
          @click="emit('toggle-sidebar')"
        >
          <BaseIcon name="panel-left-close" :size="16" />
        </button>
      </div>
      <div class="relative">
        <BaseIcon
          name="search"
          :size="14"
          class="absolute left-2 top-1/2 -translate-y-1/2 text-text-hint"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search..."
          class="w-full pl-7 pr-3 py-1.5 text-xs bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent font-ui"
        />
      </div>
      <div class="text-2xs text-text-hint mt-1.5 font-ui">
        {{ inNetworkCount }} / {{ totalEntities }} in network
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-for="section in [
          { key: 'characters', label: 'Characters', items: filteredCharacters, type: 'character' },
          { key: 'locations', label: 'Locations', items: filteredLocations, type: 'location' },
          {
            key: 'plotThreads',
            label: 'Plot Threads',
            items: filteredPlotThreads,
            type: 'plotThread'
          }
        ]"
        :key="section.key"
        class="border-b border-border-subtle last:border-b-0"
      >
        <button
          class="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-hover transition-colors"
          @click="toggleSection(section.key)"
        >
          <div class="flex items-center gap-2">
            <BaseIcon
              :name="getEntityIcon(section.type)"
              :size="14"
              :style="{ color: getEntityColor(section.type) }"
            />
            <span class="text-xs font-medium text-text-secondary font-ui">{{ section.label }}</span>
            <span class="text-2xs text-text-hint">({{ section.items.length }})</span>
          </div>
          <BaseIcon
            :name="expandedSections[section.key] ? 'chevron-up' : 'chevron-down'"
            :size="14"
            class="text-text-hint"
          />
        </button>

        <div v-if="expandedSections[section.key]" class="pb-2">
          <div
            v-for="entity in section.items"
            :key="entity.id"
            draggable="true"
            :class="[
              'mx-2 my-1 px-2 py-1.5 rounded-lg border transition-all cursor-grab',
              isInNetwork(section.type, entity.id)
                ? 'border-border-subtle bg-bg-tertiary/50'
                : 'border-transparent hover:border-border-subtle hover:bg-bg-tertiary'
            ]"
            @dragstart="(e) => handleDragStart(e, section.type, entity)"
            @dragend="emit('drag-start', null)"
          >
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 min-w-0 flex-1 text-left"
                @click.stop="toggleEntity(entity.id)"
              >
                <BaseIcon
                  :name="expandedEntities[entity.id] ? 'chevron-down' : 'chevron-right'"
                  :size="12"
                  class="text-text-hint shrink-0"
                />
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ backgroundColor: getEntityColor(section.type) }"
                ></span>
                <span class="text-xs text-text-primary truncate font-ui">{{
                  entity.name || entity.title
                }}</span>
              </button>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  v-if="!isInNetwork(section.type, entity.id)"
                  class="p-1 text-text-hint hover:text-accent rounded focus:outline-none focus:ring-1 focus:ring-accent"
                  title="Add to network"
                  @click.stop="handleQuickAdd(section.type, entity)"
                >
                  <BaseIcon name="plus" :size="12" />
                </button>
                <BaseIcon v-else name="check" :size="12" class="text-success" />
              </div>
            </div>

            <div
              v-if="entity.role || entity.description || entity.status"
              class="text-2xs text-text-hint mt-0.5 ml-5 truncate"
            >
              {{ entity.role || entity.description?.slice(0, 30) || entity.status }}
            </div>

            <div v-if="expandedEntities[entity.id]" class="mt-2 ml-4 space-y-1">
              <div
                v-for="conn in getEntityConnections(section.type, entity.id)"
                :key="conn.id"
                class="flex items-center gap-2 px-2 py-1 rounded bg-bg-secondary/50 group"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ backgroundColor: getEdgeColor(conn.relationshipType) }"
                ></span>
                <span class="text-2xs text-text-hint capitalize">
                  {{ conn.isSource ? '→' : '←' }}
                </span>
                <BaseIcon
                  :name="getEntityIcon(conn.otherType)"
                  :size="10"
                  :style="{ color: conn.otherColor }"
                  class="shrink-0"
                />
                <span class="text-2xs text-text-secondary truncate flex-1">{{
                  conn.otherLabel
                }}</span>
                <span class="text-3xs text-text-hint capitalize px-1 rounded bg-bg-tertiary">{{
                  conn.relationshipType
                }}</span>
                <div
                  class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    class="p-0.5 text-text-hint hover:text-accent rounded"
                    title="Edit connection"
                    @click.stop="handleEditConnection(conn)"
                  >
                    <BaseIcon name="pencil" :size="10" />
                  </button>
                  <button
                    class="p-0.5 text-text-hint hover:text-danger rounded"
                    title="Delete connection"
                    @click.stop="handleDeleteConnection(conn)"
                  >
                    <BaseIcon name="trash-2" :size="10" />
                  </button>
                </div>
              </div>
              <div
                v-if="getEntityConnections(section.type, entity.id).length === 0"
                class="text-2xs text-text-hint italic px-2 py-1"
              >
                No connections
              </div>
            </div>
          </div>

          <div v-if="section.items.length === 0" class="px-3 py-2 text-center">
            <span class="text-2xs text-text-hint italic">No items found</span>
          </div>
        </div>
      </div>
    </div>

    <div class="p-2 border-t border-border-subtle bg-bg-tertiary/50">
      <p class="text-2xs text-text-hint text-center font-ui">
        Drag items onto the graph to add them
      </p>
    </div>
  </div>
</template>
