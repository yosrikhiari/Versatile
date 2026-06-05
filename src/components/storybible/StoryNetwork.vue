<script setup>
import { ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { VueFlow, useVueFlow, Position, Handle } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useStoryGraphStore } from '../../stores/storyGraphStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { useNotifications } from '../../composables/useNotifications'
import { useNetworkSuggestions } from '../../composables/useNetworkSuggestions'
import BaseIcon from '../shared/BaseIcon.vue'
import EntitySidebar from './EntitySidebar.vue'
import AddConnectionModal from './AddConnectionModal.vue'
import SuggestionsModal from './SuggestionsModal.vue'
import ApplySuggestionsModal from './ApplySuggestionsModal.vue'
import AutoGenerateModal from './AutoGenerateModal.vue'

const ENTITY_TYPE_TO_PREFIX = { character: 'char', location: 'loc', plotThread: 'thread' }
const PREFIX_TO_ENTITY_TYPE = { char: 'character', loc: 'location', thread: 'plotThread' }

function prefixFromType(type) {
  return ENTITY_TYPE_TO_PREFIX[type] || 'thread'
}

function entityTypeFromPrefix(key) {
  const prefix = key.split('-')[0]
  return PREFIX_TO_ENTITY_TYPE[prefix] || 'plotThread'
}

const storyGraphStore = useStoryGraphStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const networkSuggestions = useNetworkSuggestions()

const {   
  onConnect, 
  onNodeDragStop, 
  onNodeDrag,
  onViewportChange,
  fitView, 
  screenToFlowCoordinate,
  onPaneClick,
  getViewport
} = useVueFlow()

const showSidebar = ref(true)
const showConnectionModal = ref(false)
const showSuggestionsModal = ref(false)
const showAutoGenerateModal = ref(false)
const showApplySuggestionsModal = ref(false)
const pendingSuggestions = ref([])
const pendingGroups = ref([])
const editingEdge = ref(null)
const selectedConnection = ref(null)
const nodeToConnect = ref(null)
const isDraggingOver = ref(false)
const { addToast, showConfirm } = useNotifications()
const nodePositions = ref({})
const autoGeneratePrompt = ref('')
const autoGenerateCreateGroups = ref(false)
const autoGenerateFromScratch = ref(false)
const hoveredEdgeId = ref(null)
const hoveredNodeId = ref(null)
const dragOverGroupId = ref(null)
const targetNodeToConnect = ref(null)

const GROUP_PADDING = 16
const NODE_W = 160
const NODE_H = 70

const viewport = ref({ x: 0, y: 0, zoom: 1 })

onViewportChange((vp) => {
  viewport.value = vp
})

function expandGroupIfNeeded(group, relativeX, relativeY) {
  const neededW = relativeX + NODE_W + GROUP_PADDING
  const neededH = relativeY + NODE_H + GROUP_PADDING
  if (neededW > group.width) group.width = neededW
  if (neededH > group.height) group.height = neededH
}

const showCharEdges = ref(true)
const showLocEdges = ref(true)
const showThreadEdges = ref(true)

const forceRefreshKey = ref(0)

const manualGroups = ref([])

const nodeParents = ref({}) // { 'char-1': 'group-123', 'char-2': null }

const groupColors = [
  '#f48fb1', '#ef5350', '#ce93d8', '#f06292', '#ba68c8',
  '#ff7043', '#90a4ae', '#4fc3f7', '#80cbc4', '#aed581'
]

function createGroup(groupData) {
  const newGroup = {
    id: `group-${Date.now()}`,
    name: groupData.name || 'New Group',
    color: groupData.color || groupColors[manualGroups.value.length % groupColors.length],
    x: groupData.x || 100,
    y: groupData.y || 100,
    width: groupData.width || 300,
    height: groupData.height || 200
  }
  manualGroups.value.push(newGroup)
  return newGroup
}

function deleteGroup(groupId) {
  const nodesToRemove = []
  
  for (const nodeId in nodeParents.value) {
    if (nodeParents.value[nodeId] === groupId) {
      const realBaseId = getRealEntityId(nodeId)
      const instances = nodeInstances.value[realBaseId] || []
      if (instances.length === 1 && instances[0] === nodeId) {
        nodesToRemove.push(realBaseId)
      }
      nodeParents.value[nodeId] = null
      delete nodePositions.value[nodeId]
    }
  }
  
  for (const baseId of nodesToRemove) {
    delete nodeInstances.value[baseId]
  }
  
  manualGroups.value = manualGroups.value.filter(g => g.id !== groupId)
  
  if (projectStore.currentProjectId) {
    storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
  }
}

function renameGroup(groupId, newName) {
  const group = manualGroups.value.find(g => g.id === groupId)
  if (group) {
    group.name = newName
  }
}

function updateGroupSize(groupId, width, height) {
  const group = manualGroups.value.find(g => g.id === groupId)
  if (group) {
    group.width = Math.max(100, width)
    group.height = Math.max(80, height)
  }
}

function cycleGroupColor(groupId) {
  const group = manualGroups.value.find(g => g.id === groupId)
  if (!group) return
  const currentIndex = groupColors.indexOf(group.color)
  group.color = groupColors[(currentIndex + 1) % groupColors.length]
}

const showCreateGroupModal = ref(false)
const newGroupName = ref('')
const newGroupColor = ref(groupColors[0])

function openCreateGroupModal() {
  newGroupName.value = ''
  newGroupColor.value = groupColors[manualGroups.value.length % groupColors.length]
  showCreateGroupModal.value = true
}

function confirmCreateGroup() {
  if (!newGroupName.value.trim()) return
  const { x, y, zoom } = getViewport()
  const canvasEl = document.querySelector('.vue-flow__pane')
  const rect = canvasEl?.getBoundingClientRect() || { width: 800, height: 600 }
  const centerX = (-x + rect.width / 2) / zoom
  const centerY = (-y + rect.height / 2) / zoom
  createGroup({
    name: newGroupName.value.trim(),
    color: newGroupColor.value,
    width: 320,
    height: 220,
    x: centerX - 160,
    y: centerY - 110
  })
  showCreateGroupModal.value = false
}

let resizingGroupId = null
let resizeStartX = 0
let resizeStartY = 0
let resizeStartWidth = 0
let resizeStartHeight = 0

function startGroupResize(event, groupId) {
  event.preventDefault()
  event.stopPropagation()
  const group = manualGroups.value.find(g => g.id === groupId)
  if (!group) return
  
  resizingGroupId = groupId
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartWidth = group.width
  resizeStartHeight = group.height
  
  document.addEventListener('mousemove', handleGroupResizeMove)
  document.addEventListener('mouseup', handleGroupResizeEnd)
}

function handleGroupResizeMove(event) {
  if (!resizingGroupId) return
  const deltaX = event.clientX - resizeStartX
  const deltaY = event.clientY - resizeStartY
  updateGroupSize(resizingGroupId, resizeStartWidth + deltaX, resizeStartHeight + deltaY)
}

function handleGroupResizeEnd() {
  resizingGroupId = null
  document.removeEventListener('mousemove', handleGroupResizeMove)
  document.removeEventListener('mouseup', handleGroupResizeEnd)
}

const entityColors = {
  character: '#8B5CF6',
  location: '#10B981',
  plotThread: '#F59E0B'
}

const edgeColors = {
  appears_in: '#4fc3f7',
  involved_in: '#ce93d8',
  located_at: '#80cbc4',
  intersects_with: '#80cbc4',
  features: '#ce93d8',
  connects_to: '#888888',
  ally: '#f48fb1',
  enemy: '#ef5350',
  family: '#ce93d8',
  romantic: '#f06292',
  mentor: '#ba68c8',
  rival: '#ff7043',
  neutral: '#90a4ae'
}

function getEdgeColor(relationshipType) {
  return edgeColors[relationshipType] || '#888888'
}

const entityIcons = {
  character: 'user',
  location: 'map-pin',
  plotThread: 'zap'
}

const nodeInstances = ref({})

function getRealEntityId(nodeId) {
  return nodeId.split('__')[0]
}

function isDuplicateInScope(realBaseId, targetGroupId) {
  const instances = nodeInstances.value[realBaseId] || []
  return instances.some(instanceId => {
    const scope = nodeParents.value[instanceId] ?? null
    return scope === (targetGroupId ?? null)
  })
}

function generateInstanceId(baseId, existingInstances) {
  if (!existingInstances || existingInstances.length === 0) {
    return baseId
  }
  let copyNum = 1
  while (existingInstances.includes(`${baseId}__copy${copyNum}`)) {
    copyNum++
  }
  return `${baseId}__copy${copyNum}`
}

const nodes = computed(() => {
  const result = []

  for (const group of manualGroups.value) {
    if (!group.id) continue
    const nodeCount = Object.values(nodeParents.value).filter(p => p === group.id).length
    result.push({
      id: group.id,
      type: 'group',
      position: { x: group.x || 0, y: group.y || 0 },
      style: { width: (group.width || 200) + 'px', height: (group.height || 100) + 'px' },
      data: { label: group.name || 'Unnamed Group', color: group.color, nodeCount },
      draggable: true,
      selectable: true,
      zIndex: 0
    })
  }

  let index = 0

  for (const [baseId, instanceIds] of Object.entries(storyGraphStore.nodeInstances)) {
    const type = entityTypeFromPrefix(baseId)
    const entityId = baseId.replace(/^(char|loc|thread)-/, '')
    
    let entity
    if (type === 'character') {
      entity = storyBibleStore.characters.find(c => String(c.id) === entityId)
    } else if (type === 'location') {
      entity = storyBibleStore.locations.find(l => String(l.id) === entityId)
    } else {
      entity = storyBibleStore.plotThreads.find(t => String(t.id) === entityId)
    }
    if (!entity) continue

    for (const instanceId of instanceIds) {
      const parentId = nodeParents.value[instanceId]
      const pos = (nodePositions.value[instanceId]) || (storyGraphStore.nodePositions?.[instanceId]) || { x: 100 + (index % 5) * 250, y: 100 + Math.floor(index / 5) * 150 }
      
      result.push({
        id: instanceId,
        type,
        position: pos,
        parentNode: parentId || undefined,
        data: { 
          label: entity.name || entity.title || 'Unnamed', 
          sublabel: entity.role || entity.description?.slice(0, 30) || '', 
          color: entityColors[type], 
          iconName: entityIcons[type] 
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        zIndex: 1
      })
      index++
    }
  }

  return result
})

const existingNodeIds = computed(() => nodes.value.map(n => n.id))

function getEdgeCategory(edge) {
  const isCharChar = edge.sourceType === 'character' && edge.targetType === 'character'
  const isLocLoc = edge.sourceType === 'location' && edge.targetType === 'location'
  const isThreadThread = edge.sourceType === 'plotThread' && edge.targetType === 'plotThread'
  const isCharLoc = (edge.sourceType === 'character' && edge.targetType === 'location') || 
                    (edge.sourceType === 'location' && edge.targetType === 'character')
  const isCharThread = (edge.sourceType === 'character' && edge.targetType === 'plotThread') || 
                       (edge.sourceType === 'plotThread' && edge.targetType === 'character')
  const isLocThread = (edge.sourceType === 'location' && edge.targetType === 'plotThread') ||
                      (edge.sourceType === 'plotThread' && edge.targetType === 'location')
  
  if (isCharChar) return 'char'
  if (isLocLoc) return 'loc'
  if (isThreadThread) return 'thread'
  if (isCharLoc) return 'loc'
  if (isCharThread || isLocThread) return 'thread'
  return 'other'
}

function getNodeColumn(nodeId) {
  if (nodeId.startsWith('char-')) return 0
  if (nodeId.startsWith('loc-')) return 1
  if (nodeId.startsWith('thread-')) return 2
  return 0
}

function isLongRangeEdge(sourceId, targetId) {
  const sourceCol = getNodeColumn(sourceId)
  const targetCol = getNodeColumn(targetId)
  return Math.abs(targetCol - sourceCol) >= 2
}

function getEntityBaseId(type, entityId) {
  return `${prefixFromType(type)}-${entityId}`
}

function getEntityInstances(baseId) {
  return storyGraphStore.nodeInstances[baseId] || [baseId]
}

const edges = computed(() => {
  const storeEdges = storyGraphStore.edges || []

  const validNodeIds = new Set(nodes.value.map(n => n.id))

  const result = []

  for (const edge of storeEdges) {
    const sourceBaseId = getEntityBaseId(edge.sourceType, edge.sourceId)
    const targetBaseId = getEntityBaseId(edge.targetType, edge.targetId)
    
    const sourceInstances = getEntityInstances(sourceBaseId)
    const targetInstances = getEntityInstances(targetBaseId)
    
    const validSourceInstances = sourceInstances.filter(id => validNodeIds.has(id))
    const validTargetInstances = targetInstances.filter(id => validNodeIds.has(id))
    
    if (validSourceInstances.length === 0 || validTargetInstances.length === 0) {
      continue
    }
    
    const isCharChar = edge.sourceType === 'character' && edge.targetType === 'character'
    const label = isCharChar ? edge.relationshipType : edge.relationshipType.replace(/_/g, ' ')
    const category = getEdgeCategory(edge)
    
    let sourceIndex = 0
    for (const sourceId of validSourceInstances) {
      let targetIndex = 0
      for (const targetId of validTargetInstances) {
        const isLongRange = isLongRangeEdge(sourceId, targetId)
        const staggerOffset = (targetIndex - (validTargetInstances.length - 1) / 2) * 12
        
        result.push({
          id: `edge-${edge.id}__${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          type: 'custom',
          animated: false,
          data: {
            edgeData: edge,
            color: getEdgeColor(edge.relationshipType),
            staggerOffset,
            relationshipType: edge.relationshipType,
            label,
            category,
            isLongRange
          }
        })
        targetIndex++
      }
      sourceIndex++
    }
  }

  return result
})

const groupEdges = computed(() => {
  const storeGroupEdges = storyGraphStore.groupEdges || []
  const validGroupIds = new Set(manualGroups.value.map(g => g.id))

  return storeGroupEdges
    .filter(edge => validGroupIds.has(edge.sourceGroupId) && validGroupIds.has(edge.targetGroupId))
    .map(edge => ({
      id: `group-edge-${edge.id}`,
      source: edge.sourceGroupId,
      target: edge.targetGroupId,
      type: 'custom',
      animated: false,
      style: {
        strokeDasharray: '6 3',
        strokeWidth: 2.5,
        stroke: '#6366f1'
      },
      data: {
        edgeData: edge,
        color: '#6366f1',
        relationshipType: edge.relationshipType,
        label: edge.relationshipType.replace(/_/g, ' '),
        category: 'group',
        isGroupEdge: true,
        description: edge.description || ''
      }
    }))
})

function getEdgeOpacity(edgeId) {
  const edge = edges.value.find(e => e.id === edgeId)
  if (!edge) return 0.35
  
  if (hoveredEdgeId.value === edgeId) return 1.0
  
  if (hoveredNodeId.value) {
    const isConnected = edge.source === hoveredNodeId.value || edge.target === hoveredNodeId.value
    return isConnected ? 1.0 : 0.05
  }
  
  if (edge.data?.isGroupEdge) return 0.7
  
  return 0.35
}

watch(() => nodes.value.length, () => {
  setTimeout(() => fitView({ padding: 0.2 }), 100)
})

watch(() => storyGraphStore.edges.length, (newLen, oldLen) => {
  console.log('[watch] edges length changed:', oldLen, '→', newLen)
  forceRefreshKey.value++
})

let groupSaveTimer = null
watch(() => manualGroups.value, (groups) => {
  if (!projectStore.currentProjectId) return
  clearTimeout(groupSaveTimer)
  groupSaveTimer = setTimeout(() => {
    storyGraphStore.saveGroups(projectStore.currentProjectId, toRaw(groups))
  }, 500)
}, { deep: true })

watch(() => nodeParents.value, (parents) => {
  if (projectStore.currentProjectId) {
    storyGraphStore.saveNodeParents(projectStore.currentProjectId, toRaw(parents))
  }
}, { deep: true })

function getAbsoluteNodePosition(node) {
  const currentParentId = nodeParents.value[node.id]
  if (currentParentId) {
    const parentGroup = manualGroups.value.find(g => g.id === currentParentId)
    if (parentGroup) {
      return {
        x: parentGroup.x + node.position.x,
        y: parentGroup.y + node.position.y
      }
    }
  }
  return { x: node.position.x, y: node.position.y }
}

onNodeDragStop(({ node }) => {
  dragOverGroupId.value = null

  if (manualGroups.value.some(g => g.id === node.id)) {
    const group = manualGroups.value.find(g => g.id === node.id)
    if (group) {
      group.x = node.position.x
      group.y = node.position.y
    }
    return
  }

  const realBaseId = getRealEntityId(node.id)
  const absPos = getAbsoluteNodePosition(node)

  for (const group of manualGroups.value) {
    const inside =
      absPos.x >= group.x &&
      absPos.x <= group.x + group.width &&
      absPos.y >= group.y &&
      absPos.y <= group.y + group.height

    if (inside) {
      const currentParent = nodeParents.value[node.id]
      if (currentParent === group.id) {
        const relativePos = {
          x: absPos.x - group.x,
          y: absPos.y - group.y
        }
        nodeParents.value[node.id] = group.id
        nodePositions.value[node.id] = relativePos
        storyGraphStore.saveNodePosition(projectStore.currentProjectId, node.id, relativePos)
        return
      }
      
      if (isDuplicateInScope(realBaseId, group.id)) {
        const prevParent = nodeParents.value[node.id]
        if (prevParent) {
          const prevGroup = manualGroups.value.find(g => g.id === prevParent)
          if (prevGroup) {
            const prevPos = nodePositions.value[node.id] || { x: 0, y: 0 }
            nodeParents.value[node.id] = prevParent
            nodePositions.value[node.id] = prevPos
            storyGraphStore.saveNodePosition(projectStore.currentProjectId, node.id, prevPos)
          }
        } else {
          const prevPos = nodePositions.value[node.id] || absPos
          nodeParents.value[node.id] = null
          nodePositions.value[node.id] = prevPos
          storyGraphStore.saveNodePosition(projectStore.currentProjectId, node.id, prevPos)
        }
        addToast('Already in this group')
        return
      }
      
      const relativePos = {
        x: absPos.x - group.x,
        y: absPos.y - group.y
      }
      nodeParents.value[node.id] = group.id
      nodePositions.value[node.id] = relativePos
      storyGraphStore.saveNodePosition(projectStore.currentProjectId, node.id, relativePos)
      return
    }
  }

  nodeParents.value[node.id] = null
  nodePositions.value[node.id] = absPos
  if (projectStore.currentProjectId) {
    storyGraphStore.saveNodePosition(projectStore.currentProjectId, node.id, absPos)
  }
})

onNodeDrag(({ node }) => {
  if (manualGroups.value.some(g => g.id === node.id)) {
    dragOverGroupId.value = null
    return
  }
  
  const absPos = getAbsoluteNodePosition(node)
  
  for (const group of manualGroups.value) {
    const inside =
      absPos.x >= group.x &&
      absPos.x <= group.x + group.width &&
      absPos.y >= group.y &&
      absPos.y <= group.y + group.height
    
    if (inside) {
      dragOverGroupId.value = group.id
      return
    }
  }
})

onPaneClick(() => {
  selectedConnection.value = null
})

function handleNodeDoubleClick(event) {
  nodeToConnect.value = event.node
  editingEdge.value = null
  showConnectionModal.value = true
}

function handleEdgeClick(event) {
  selectedConnection.value = event.edge.data?.edgeData || null
}

function handleNodeMouseEnter(node) {
  hoveredNodeId.value = node.id
}

function handleNodeMouseLeave() {
  hoveredNodeId.value = null
}

function getBezierPath(sourceX, sourceY, targetX, targetY, isLongRange = false) {
  const controlOffset = isLongRange ? 140 : 80
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`
}

function openAddConnectionModal() {
  nodeToConnect.value = null
  editingEdge.value = null
  showConnectionModal.value = true
}

function editConnection(edge) {
  nodeToConnect.value = null
  editingEdge.value = edge
  showConnectionModal.value = true
}

async function deleteConnection(edge) {
  if (await showConfirm('Delete Connection', 'Are you sure you want to delete this connection?')) {
    if (edge.isLegacy) {
      const originalId = parseInt(edge.id.replace('char-rel-', ''))
      storyGraphStore.deleteLegacyEdge(originalId)
    } else if (edge.sourceGroupId) {
      storyGraphStore.deleteGroupEdgeData(edge.id, projectStore.currentProjectId)
    } else {
      storyGraphStore.deleteEdgeData(edge.id, projectStore.currentProjectId)
    }
    selectedConnection.value = null
  }
}

async function handleSidebarDeleteConnection(edge) {
  if (await showConfirm('Delete Connection', 'Are you sure you want to delete this connection?')) {
    if (edge.isLegacy) {
      const originalId = parseInt(edge.id.replace('char-rel-', ''))
      storyGraphStore.deleteLegacyEdge(originalId)
    } else if (edge.sourceGroupId) {
      storyGraphStore.deleteGroupEdgeData(edge.id, projectStore.currentProjectId)
    } else {
      storyGraphStore.deleteEdgeData(edge.id, projectStore.currentProjectId)
    }
  }
}

function isConnectionExists(sourceType, sourceId, targetType, targetId) {
  const node1Id = `${prefixFromType(sourceType)}-${sourceId}`
  const node2Id = `${prefixFromType(targetType)}-${targetId}`
  
  return storyGraphStore.edges.some(edge => {
    const edgeSourceId = `${prefixFromType(edge.sourceType)}-${edge.sourceId}`
    const edgeTargetId = `${prefixFromType(edge.targetType)}-${edge.targetId}`
    return (edgeSourceId === node1Id && edgeTargetId === node2Id) ||
           (edgeSourceId === node2Id && edgeTargetId === node1Id)
  })
}

async function handleSaveConnection(connectionData) {
  if (!projectStore.currentProjectId) {
    return
  }

  if (!editingEdge.value && isConnectionExists(connectionData.sourceType, connectionData.sourceId, connectionData.targetType, connectionData.targetId)) {
    showConnectionModal.value = false
    return
  }

  if (editingEdge.value) {
    await storyGraphStore.updateEdgeData(editingEdge.value.id, connectionData, projectStore.currentProjectId)
  } else {
    await storyGraphStore.addEdgeData(projectStore.currentProjectId, connectionData)
  }
  
  showConnectionModal.value = false
  nodeToConnect.value = null
  editingEdge.value = null
}

async function handleSaveGroupEdge(groupEdgeData) {
  if (!projectStore.currentProjectId) {
    return
  }

  await storyGraphStore.addGroupEdgeData(projectStore.currentProjectId, groupEdgeData)
  
  showConnectionModal.value = false
  nodeToConnect.value = null
  editingEdge.value = null
}

function handleConnect(params) {
  console.log('[handleConnect] Connection params:', params)
  
  const sourceId = params.source
  const targetId = params.target
  
  const isSourceGroup = manualGroups.value.some(g => g.id === sourceId)
  const isTargetGroup = manualGroups.value.some(g => g.id === targetId)
  
  console.log('[handleConnect] isSourceGroup:', isSourceGroup, 'isTargetGroup:', isTargetGroup)
  
  if (isSourceGroup && isTargetGroup) {
    console.log('[handleConnect] Opening modal for group-to-group connection')
    nodeToConnect.value = { id: sourceId }
    targetNodeToConnect.value = { id: targetId }
    editingEdge.value = null
    showConnectionModal.value = true
  } else {
    console.log('[handleConnect] Non-group connection - ignoring (handled elsewhere)')
  }
}

function handleRemoveNode(node) {
  const instanceId = node.id
  const baseId = getRealEntityId(instanceId)
  
  const instances = nodeInstances.value[baseId] || []
  const newInstances = instances.filter(id => id !== instanceId)
  
  if (newInstances.length > 0) {
    nodeInstances.value[baseId] = newInstances
  } else {
    delete nodeInstances.value[baseId]
  }
  
  delete nodeParents.value[instanceId]
  delete nodePositions.value[instanceId]
  
  showConnectionModal.value = false
  nodeToConnect.value = null
  editingEdge.value = null
  
  if (projectStore.currentProjectId) {
    storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
    storyGraphStore.saveAllNodePositions(projectStore.currentProjectId, nodePositions.value)
    storyGraphStore.saveNodeParents(projectStore.currentProjectId, nodeParents.value)
  }
}

function handleDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  isDraggingOver.value = true
}

function handleDragLeave() {
  isDraggingOver.value = false
}

function handleDrop(event) {
  event.preventDefault()
  isDraggingOver.value = false
  
  try {
    const data = event.dataTransfer.getData('application/json')
    if (!data) {
      return
    }
    
    const entity = JSON.parse(data)
    const baseId = `${prefixFromType(entity.type)}-${entity.id}`
    const entityLabel = entity.name || entity.label || entity.title || 'Entity'
    
    const clientRect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - clientRect.left
    const y = event.clientY - clientRect.top
    
    const flowPosition = screenToFlowCoordinate({ x, y })
    
    let parentId = null
    let relativePos = flowPosition
    for (const group of manualGroups.value) {
      const insideX = flowPosition.x >= group.x && flowPosition.x <= group.x + group.width
      const insideY = flowPosition.y >= group.y && flowPosition.y <= group.y + group.height
      if (insideX && insideY) {
        parentId = group.id
        relativePos = {
          x: flowPosition.x - group.x,
          y: flowPosition.y - group.y
        }
        break
      }
    }
    
    if (entity.type === 'group') {
      const groupNode = manualGroups.value.find(g => g.id === baseId)
      if (groupNode) {
        if (parentId) {
          groupNode.x = relativePos.x
          groupNode.y = relativePos.y
          nodeParents.value[baseId] = parentId
        } else {
          groupNode.x = flowPosition.x
          groupNode.y = flowPosition.y
          nodeParents.value[baseId] = null
        }
      }
      return
    }
    
    if (isDuplicateInScope(baseId, parentId)) {
      addToast('Already in this group')
      return
    }
    
    let instanceId = baseId
    const existingInstances = nodeInstances.value[baseId]
    if (existingInstances?.length > 0) {
      instanceId = generateInstanceId(baseId, existingInstances)
    }
    
    if (!nodeInstances.value[baseId]) {
      nodeInstances.value[baseId] = []
    }
    if (!nodeInstances.value[baseId].includes(instanceId)) {
      nodeInstances.value[baseId].push(instanceId)
    }
    
    if (projectStore.currentProjectId) {
      if (parentId) {
        const group = manualGroups.value.find(g => g.id === parentId)
        if (group) expandGroupIfNeeded(group, relativePos.x, relativePos.y)
        nodeParents.value[instanceId] = parentId
        nodePositions.value[instanceId] = relativePos
        storyGraphStore.saveNodePosition(projectStore.currentProjectId, instanceId, relativePos)
        storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
      } else {
        nodePositions.value[instanceId] = flowPosition
        storyGraphStore.saveNodePosition(projectStore.currentProjectId, instanceId, flowPosition)
        storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
      }
      addToast(`Added "${entityLabel}" to network`)
    }
    
  } catch (e) {
    console.error('Drop error:', e)
  }
}

function handleQuickAdd(entity) {
  const baseId = `${prefixFromType(entity.type)}-${entity.id}`
  
  if (isDuplicateInScope(baseId, null)) {
    addToast('Already in network')
    return
  }
  
  let instanceId = baseId
  const existingInstances = nodeInstances.value[baseId]
  if (existingInstances?.length > 0) {
    instanceId = generateInstanceId(baseId, existingInstances)
  }
  
  if (!nodeInstances.value[baseId]) {
    nodeInstances.value[baseId] = []
  }
  if (!nodeInstances.value[baseId].includes(instanceId)) {
    nodeInstances.value[baseId].push(instanceId)
  }
  
  let nextPosition = { x: 100, y: 100 }
  
  if (nodes.value.length > 0) {
    const lastNode = nodes.value.at(-1)
    nextPosition = {
      x: lastNode.position.x + 50,
      y: lastNode.position.y + 50
    }
  }
  
  nodePositions.value[instanceId] = nextPosition
  
  if (projectStore.currentProjectId) {
    storyGraphStore.saveNodePosition(projectStore.currentProjectId, instanceId, nextPosition)
    storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
    addToast(`Added "${entity.label}" to network`)
  }
}


function toggleSidebar() {
  showSidebar.value = !showSidebar.value
}

function openAutoGenerateModal() {
  autoGeneratePrompt.value = ''
  autoGenerateCreateGroups.value = false
  autoGenerateFromScratch.value = false
  showAutoGenerateModal.value = true
}

async function handleAutoGenerate() {
  if (!projectStore.currentProjectId) {
    return
  }
  
  showAutoGenerateModal.value = false
  
  let suggestions = []
  let groups = []
  const canvasEntityIds = autoGenerateFromScratch.value 
    ? Object.keys(nodeInstances.value)
    : null
  
  if (autoGenerateFromScratch.value) {
    console.log('[AutoGenerate] From scratch - clearing connections and groups, keeping nodes')
    manualGroups.value = []
    nodeParents.value = {}
    storyGraphStore.edges = []
    if (projectStore.currentProjectId) {
      await storyGraphStore.clearAllEdges(projectStore.currentProjectId)
      await storyGraphStore.saveGroups(projectStore.currentProjectId, [])
      await storyGraphStore.saveNodeParents(projectStore.currentProjectId, {})
    }
  }
  
  if (autoGenerateCreateGroups.value) {
    const result = await networkSuggestions.autoGenerateNetworkWithGroups({
      existingEntities: canvasEntityIds,
      confidenceThreshold: 0.8,
      groupConfidenceThreshold: 0.5,
      prompt: autoGeneratePrompt.value
    })
    
    suggestions = result.connections || []
    groups = result.groups || []
  } else {
    suggestions = await networkSuggestions.autoGenerateWithAI({
      existingEntities: canvasEntityIds,
      confidenceThreshold: 0.8,
      prompt: autoGeneratePrompt.value
    })
  }
  
  if (suggestions.length > 0 || groups.length > 0) {
    showApplySuggestionsModal.value = true
    pendingSuggestions.value = suggestions
    pendingGroups.value = groups
  } else {
    addToast('No connections found with current threshold')
  }
}

async function handleGetSuggestions() {
  showSuggestionsModal.value = true
}

async function handleApplySuggestions(selectedIndices) {
  const suggestions = networkSuggestions.suggestions.value
  let applied = 0
  let skipped = 0
  
  for (const index of selectedIndices) {
    if (suggestions[index]) {
      const result = await networkSuggestions.applySuggestion(suggestions[index])
      if (result.success) {
        applied++
      } else {
        skipped++
      }
    }
  }
  
  if (projectStore.currentProjectId) {
    await storyGraphStore.loadEdges(projectStore.currentProjectId)
  }
  
  showSuggestionsModal.value = false
  if (skipped > 0) {
    addToast(`Applied ${applied} connections, ${skipped} skipped`)
  } else {
    addToast(`Applied ${applied} connections`)
  }
}

async function handleApplyPendingSuggestions(checkedIndices) {
  let connected = 0
  let groupsApplied = 0
  const failures = { already_connected: 0, source_not_found: 0, target_not_found: 0, self_reference: 0, error: 0 }
  
  const NODE_W = 160
  const NODE_H = 70
  const GROUP_PADDING = 16
  const GROUP_HEADER_H = 30
  const NODES_PER_ROW = 2
  const NODE_GAP = 12
  
  const suggestionsLen = pendingSuggestions.value.length
  const suggestionIndices = checkedIndices.filter(i => i < suggestionsLen)
  const groupIndices = checkedIndices.filter(i => i >= suggestionsLen).map(i => i - suggestionsLen)
  
  for (const index of suggestionIndices) {
    if (pendingSuggestions.value[index]) {
      const result = await networkSuggestions.applySuggestion(pendingSuggestions.value[index])
      if (result.success) {
        connected++
      } else if (result.reason && failures.hasOwnProperty(result.reason)) {
        failures[result.reason]++
      } else {
        failures.error++
      }
    }
  }
  
  for (const index of groupIndices) {
    const group = pendingGroups.value[index]
    if (group) {
      group.id = group.id || `group-${Date.now()}-${index}`
      group.x = 50 + (index % 3) * 400
      group.y = 50 + Math.floor(index / 3) * 300
      group.width = 320
      group.height = 220
      manualGroups.value.push(group)
      
      const nodePositionCounts = {}
      
      for (const member of group.members) {
        const prefix = member.type === 'character' ? 'char' : member.type === 'location' ? 'loc' : 'thread'
        const nodeId = `${prefix}-${member.id}`
        nodeParents.value[nodeId] = group.id

        if (!nodePositionCounts[group.id]) {
          nodePositionCounts[group.id] = 0
        }

        const count = nodePositionCounts[group.id]
        const col = count % NODES_PER_ROW
        const row = Math.floor(count / NODES_PER_ROW)

        const relX = GROUP_PADDING + col * (NODE_W + NODE_GAP)
        const relY = GROUP_HEADER_H + GROUP_PADDING + row * (NODE_H + NODE_GAP)

        nodePositions.value[nodeId] = { x: relX, y: relY }

        nodePositionCounts[group.id]++
      }
      
      groupsApplied++
    }
  }
  
  nodeParents.value = { ...nodeParents.value }
  nodePositions.value = { ...nodePositions.value }
  
  if (projectStore.currentProjectId) {
    console.log('[handleApply] BEFORE loadEdges, store edges count:', storyGraphStore.edges.length)
    await storyGraphStore.saveGroups(projectStore.currentProjectId, manualGroups.value)
    await storyGraphStore.saveNodeParents(projectStore.currentProjectId, nodeParents.value)
    await storyGraphStore.saveAllNodePositions(projectStore.currentProjectId, nodePositions.value)
    await storyGraphStore.loadEdges(projectStore.currentProjectId)
    console.log('[handleApply] AFTER loadEdges, store edges count:', storyGraphStore.edges.length)
  }
  
  showApplySuggestionsModal.value = false
  pendingSuggestions.value = []
  pendingGroups.value = []
  
  const totalFailures = failures.already_connected + failures.source_not_found + failures.target_not_found + failures.self_reference + failures.error
  let toastMsg = `Applied ${connected} connections`
  if (groupsApplied > 0) {
    toastMsg += `, ${groupsApplied} groups`
  }
  if (totalFailures > 0) {
    toastMsg += `, ${totalFailures} skipped`
    if (failures.already_connected > 0) toastMsg += ` (${failures.already_connected} duplicates)`
  }
  addToast(toastMsg)
}

watch(() => showSuggestionsModal.value, async (show) => {
  if (show) {
    try {
      const result = await networkSuggestions.generateNetworkWithAI()
      networkSuggestions.suggestions.value = result || []
    } catch (err) {
      console.error('Failed to generate suggestions:', err)
      networkSuggestions.suggestions.value = []
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleGroupResizeMove)
  document.removeEventListener('mouseup', handleGroupResizeEnd)
})

/**
 * Consolidated graph initialization — loads all graph data for a project,
 * repairs orphan parents, backfills missing node instances/positions.
 * Called from both onMounted and the project watcher.
 */
async function initGraph(projectId) {
  if (!projectId) return

  if (storyBibleStore.characters.length === 0) {
    await storyBibleStore.loadAll(projectId)
  }
  await storyGraphStore.loadNodePositions(projectId)
  await storyGraphStore.loadNodeInstances(projectId)
  await storyGraphStore.loadEdges(projectId)
  await storyGraphStore.loadGroupEdges(projectId)
  
  const [groups, parents] = await Promise.all([
    storyGraphStore.loadGroups(projectId),
    storyGraphStore.loadNodeParents(projectId)
  ])
  manualGroups.value = groups || []
  nodeParents.value = parents || {}
  nodeInstances.value = storyGraphStore.nodeInstances || {}
  
  // Repair: remove parent references to deleted groups
  const validGroupIds = new Set(manualGroups.value.map(g => g.id))
  for (const nodeId in nodeParents.value) {
    const parentId = nodeParents.value[nodeId]
    if (parentId && !validGroupIds.has(parentId)) {
      nodeParents.value[nodeId] = null
    }
  }
  await storyGraphStore.saveNodeParents(projectId, nodeParents.value)
  
  // Backfill: rebuild node instances from existing positions
  if (Object.keys(nodeInstances.value).length === 0 && Object.keys(storyGraphStore.nodePositions).length > 0) {
    for (const key of Object.keys(storyGraphStore.nodePositions)) {
      const baseId = getRealEntityId(key)
      if (!nodeInstances.value[baseId]) nodeInstances.value[baseId] = []
      if (!nodeInstances.value[baseId].includes(key)) nodeInstances.value[baseId].push(key)
    }
    await storyGraphStore.saveNodeInstances(projectId)
  }
  
  // Backfill: assign positions to characters that lack them
  const missingCharIds = storyGraphStore.missingCharacterPositions
  if (missingCharIds.length > 0) {
    const positions = { ...storyGraphStore.nodePositions }
    const existingCharIds = new Set(storyBibleStore.characters.map(c => String(c.id)))
    let charCount = storyBibleStore.characters.length
    for (const charId of missingCharIds) {
      if (!existingCharIds.has(charId)) continue
      const nodeId = `char-${charId}`
      if (!positions[nodeId]) {
        positions[nodeId] = { 
          x: 100 + (charCount % 5) * 250, 
          y: 100 + Math.floor(charCount / 5) * 150 
        }
        charCount++
      }
    }
    await storyGraphStore.saveAllNodePositions(projectId, positions)
  }

  // Backfill: create default positions for all entities if none exist
  if (Object.keys(nodeInstances.value).length === 0) {
    const positions = {}
    let idx = 0

    for (const char of storyBibleStore.characters) {
      const baseId = `char-${char.id}`
      nodeInstances.value[baseId] = [baseId]
      positions[baseId] = { x: 100 + (idx % 5) * 250, y: 100 + Math.floor(idx / 5) * 150 }
      idx++
    }
    for (const loc of storyBibleStore.locations) {
      const baseId = `loc-${loc.id}`
      nodeInstances.value[baseId] = [baseId]
      positions[baseId] = { x: 100 + (idx % 5) * 250, y: 100 + Math.floor(idx / 5) * 150 }
      idx++
    }
    for (const thread of storyBibleStore.plotThreads) {
      const baseId = `thread-${thread.id}`
      nodeInstances.value[baseId] = [baseId]
      positions[baseId] = { x: 100 + (idx % 5) * 250, y: 100 + Math.floor(idx / 5) * 150 }
      idx++
    }

    await Promise.all([
      storyGraphStore.saveNodeInstances(projectId),
      storyGraphStore.saveAllNodePositions(projectId, positions)
    ])
  }
}

onMounted(() => {
  initGraph(projectStore.currentProjectId)
})

watch(() => projectStore.currentProjectId, (newId) => {
  initGraph(newId)
})

async function arrangeExtendedStarLayout() {
  if (!projectStore.currentProjectId) return

  const edges = storyGraphStore.edges
  const characters = storyBibleStore.characters
  const locations = storyBibleStore.locations
  const plotThreads = storyBibleStore.plotThreads

  if (edges.length === 0) {
    addToast('No connections to arrange')
    return
  }

  // Normalize edge type to node ID prefix
  function toNodeKey(type, id) {
    const prefix = type === 'character' ? 'char' : type === 'location' ? 'loc' : 'thread'
    return `${prefix}-${id}`
  }

  const centerX = 800
  const centerY = 600
  const groupRadius = 500
  const outerOrphanRadius = groupRadius + 400

  // Remove existing orphan groups to prevent duplicates
  const orphanGroupIds = new Set(
    manualGroups.value.filter(g => g.name?.startsWith('Unconnected')).map(g => g.id)
  )
  for (const key of Object.keys(nodeParents.value)) {
    if (orphanGroupIds.has(nodeParents.value[key])) {
      delete nodeParents.value[key]
    }
  }
  manualGroups.value = manualGroups.value.filter(g => !orphanGroupIds.has(g.id))

  // Step 1: Count connections per node using CORRECT key format
  const connectionCounts = {}
  for (const edge of edges) {
    const sk = toNodeKey(edge.sourceType, edge.sourceId)
    const tk = toNodeKey(edge.targetType, edge.targetId)
    connectionCounts[sk] = (connectionCounts[sk] || 0) + 1
    connectionCounts[tk] = (connectionCounts[tk] || 0) + 1
  }

  // Step 2: Find most connected node
  let mostConnectedKey = null
  let maxCount = 0
  for (const [key, count] of Object.entries(connectionCounts)) {
    if (count > maxCount) { maxCount = count; mostConnectedKey = key }
  }

  // Step 3: Build group membership map from nodeParents
  const charToGroup = {}
  const groupMemberMap = {}
  for (const [nodeKey, groupId] of Object.entries(nodeParents.value)) {
    if (groupId) {
      const baseKey = getRealEntityId(nodeKey)
      charToGroup[baseKey] = groupId
      if (!groupMemberMap[groupId]) groupMemberMap[groupId] = []
      if (!groupMemberMap[groupId].includes(baseKey)) {
        groupMemberMap[groupId].push(baseKey)
      }
    }
  }

  // Step 4: Find most connected node per group
  const groupCenters = {}
  for (const [groupId, memberKeys] of Object.entries(groupMemberMap)) {
    let bestKey = null, bestCount = 0
    for (const key of memberKeys) {
      const c = connectionCounts[key] || 0
      if (c > bestCount) { bestCount = c; bestKey = key }
    }
    if (bestKey) groupCenters[groupId] = bestKey
  }

  // Step 5: Calculate inter-group connection counts
  const interGroupConnections = {}
  for (const edge of edges) {
    const sk = toNodeKey(edge.sourceType, edge.sourceId)
    const tk = toNodeKey(edge.targetType, edge.targetId)
    const sg = charToGroup[sk]
    const tg = charToGroup[tk]
    if (sg && tg && sg !== tg) {
      interGroupConnections[sg] = (interGroupConnections[sg] || 0) + 1
      interGroupConnections[tg] = (interGroupConnections[tg] || 0) + 1
    }
  }

  // Step 6: Position groups radially
  const positions = {}
  const groupPositions = {}

  // Place most connected node at center
  if (mostConnectedKey) {
    positions[mostConnectedKey] = { x: centerX, y: centerY }
  }

  const allGroupIds = manualGroups.value.map(g => g.id)
  allGroupIds.forEach((gid, i) => {
    const angle = (i / allGroupIds.length) * 2 * Math.PI
    const interCount = interGroupConnections[gid] || 0
    const maxInter = Math.max(1, ...Object.values(interGroupConnections))
    const distanceRatio = 1 - (interCount / maxInter)
    const distance = groupRadius * (0.4 + distanceRatio * 0.6)
    groupPositions[gid] = {
      x: Math.round(centerX + Math.cos(angle) * distance),
      y: Math.round(centerY + Math.sin(angle) * distance)
    }
  })

  // Write group positions back to group objects
  for (const group of manualGroups.value) {
    const gpos = groupPositions[group.id]
    if (gpos) {
      group.x = gpos.x
      group.y = gpos.y
    }
  }

  // Step 7: Position nodes within each group as grid (RELATIVE to group origin)
  const GROUP_HEADER_H = 30
  const GROUP_PADDING = 16
  const NODE_W = 160
  const NODE_H = 70
  const NODE_PAD = 12
  const NODES_PER_ROW = 2

  for (const group of manualGroups.value) {
    const gpos = groupPositions[group.id]
    if (!gpos) continue
    const members = groupMemberMap[group.id] || []
    
    // Filter out the most connected node (already placed at global center)
    const placeable = members.filter(k => k !== mostConnectedKey)
    
    // Resize group to fit all nodes
    const rows = Math.ceil(placeable.length / NODES_PER_ROW)
    group.width = Math.max(220, GROUP_PADDING * 2 + NODES_PER_ROW * NODE_W + (NODES_PER_ROW - 1) * NODE_PAD)
    group.height = Math.max(120, GROUP_HEADER_H + GROUP_PADDING * 2 + rows * NODE_H + (rows - 1) * NODE_PAD)

    placeable.forEach((key, idx) => {
      const col = idx % NODES_PER_ROW
      const row = Math.floor(idx / NODES_PER_ROW)
      positions[key] = {
        x: GROUP_PADDING + col * (NODE_W + NODE_PAD),
        y: GROUP_HEADER_H + GROUP_PADDING + row * (NODE_H + NODE_PAD)
      }
    })
  }

  // Step 8: Detect orphans — never appear in any edge
  const connectedKeys = new Set()
  for (const edge of edges) {
    connectedKeys.add(toNodeKey(edge.sourceType, edge.sourceId))
    connectedKeys.add(toNodeKey(edge.targetType, edge.targetId))
  }

  const orphanChars = characters.filter(c => !connectedKeys.has(`char-${c.id}`))
  const orphanLocs = locations.filter(l => !connectedKeys.has(`loc-${l.id}`))
  const orphanThreads = plotThreads.filter(t => !connectedKeys.has(`thread-${t.id}`))

  const orphanDefs = [
    { entities: orphanChars, name: 'Unconnected Characters', type: 'character', prefix: 'char', color: '#8B5CF6' },
    { entities: orphanLocs, name: 'Unconnected Locations', type: 'location', prefix: 'loc', color: '#10B981' },
    { entities: orphanThreads, name: 'Unconnected Plot Threads', type: 'plotThread', prefix: 'thread', color: '#F59E0B' }
  ].filter(d => d.entities.length > 0)

  const newOrphanGroups = []
  orphanDefs.forEach(({ entities, name, type, prefix, color }, idx) => {
    // Calculate group dimensions first
    const rows = Math.ceil(entities.length / NODES_PER_ROW)
    const groupWidth = Math.max(220, GROUP_PADDING * 2 + NODES_PER_ROW * NODE_W + NODE_PAD)
    const groupHeight = Math.max(120, GROUP_HEADER_H + GROUP_PADDING * 2 + rows * NODE_H + (rows - 1) * NODE_PAD)

    // Place all orphan groups in a horizontal row below the main architecture
    const totalOrphanWidth = orphanDefs.length * groupWidth + (orphanDefs.length - 1) * 60
    const startX = centerX - totalOrphanWidth / 2
    const gx = Math.round(startX + idx * (groupWidth + 60))
    const gy = Math.round(centerY + groupRadius + 200)

    const group = {
      id: `orphan-group-${type}-${Date.now()}-${idx}`,
      name,
      type: 'character_group',
      color,
      x: gx,
      y: gy,
      width: groupWidth,
      height: groupHeight,
      members: entities.map(e => ({ type, id: e.id }))
    }
    manualGroups.value.push(group)
    newOrphanGroups.push(group)

    // Position nodes in grid (RELATIVE to group origin)
    entities.forEach((entity, i) => {
      const key = `${prefix}-${entity.id}`
      const col = i % NODES_PER_ROW
      const row = Math.floor(i / NODES_PER_ROW)
      positions[key] = {
        x: GROUP_PADDING + col * (NODE_W + NODE_PAD),
        y: GROUP_HEADER_H + GROUP_PADDING + row * (NODE_H + NODE_PAD)
      }
      nodeParents.value[key] = group.id
    })
  })

  // Step 9: Collision detection — ONLY on ungrouped nodes (preserve relative positions of grouped)
  const groupedKeys = new Set(Object.keys(nodeParents.value).filter(k => nodeParents.value[k]))
  const ungroupedKeys = Object.keys(positions).filter(k => !groupedKeys.has(k))

  const MIN_DIST = 200
  for (let pass = 0; pass < 5; pass++) {
    let moved = false
    for (let i = 0; i < ungroupedKeys.length; i++) {
      for (let j = i + 1; j < ungroupedKeys.length; j++) {
        const a = positions[ungroupedKeys[i]], b = positions[ungroupedKeys[j]]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MIN_DIST && dist > 0) {
          const overlap = MIN_DIST - dist
          const nx = dx / dist, ny = dy / dist
          a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5
          b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5
          moved = true
        }
      }
    }
    if (!moved) break
  }
  // Round ungrouped keys
  for (const k of ungroupedKeys) {
    positions[k].x = Math.round(positions[k].x)
    positions[k].y = Math.round(positions[k].y)
  }
  // Round grouped keys separately (no collision adjustment)
  for (const k of Object.keys(positions)) {
    if (groupedKeys.has(k)) {
      positions[k].x = Math.round(positions[k].x)
      positions[k].y = Math.round(positions[k].y)
    }
  }

  // Step 10: Force reactivity then save
  nodeParents.value = { ...nodeParents.value }

  await storyGraphStore.saveGroups(projectStore.currentProjectId, manualGroups.value)
  await storyGraphStore.saveNodeParents(projectStore.currentProjectId, nodeParents.value)
  await storyGraphStore.saveAllNodePositions(projectStore.currentProjectId, positions)
  nodePositions.value = { ...positions }

  const orphanTotal = orphanChars.length + orphanLocs.length + orphanThreads.length
  addToast(`Star layout: ${allGroupIds.length} groups, ${orphanTotal} orphans grouped`)

  setTimeout(() => fitView({ padding: 0.15 }), 150)
}
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary overflow-hidden">
    <div class="shrink-0 px-4 py-2 h-14 border-b border-border-subtle flex items-center justify-between bg-bg-secondary z-10">
      <div class="flex items-center gap-2">
        <span class="font-spark text-accent tracking-wide">Story Network</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 border-l border-border-subtle pl-3">
          <button
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-all"
            :class="showCharEdges ? 'bg-bg-tertiary text-text-primary' : 'bg-bg-secondary text-text-hint opacity-50'"
            title="Toggle character relationships"
            @click="showCharEdges = !showCharEdges"
          >
            <span class="w-2 h-2 rounded-full bg-[#f48fb1]"></span>
            Characters
          </button>
          <button
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-all"
            :class="showLocEdges ? 'bg-bg-tertiary text-text-primary' : 'bg-bg-secondary text-text-hint opacity-50'"
            title="Toggle location connections"
            @click="showLocEdges = !showLocEdges"
          >
            <span class="w-2 h-2 rounded-full bg-[#4fc3f7]"></span>
            Locations
          </button>
          <button
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-all"
            :class="showThreadEdges ? 'bg-bg-tertiary text-text-primary' : 'bg-bg-secondary text-text-hint opacity-50'"
            title="Toggle plot thread connections"
            @click="showThreadEdges = !showThreadEdges"
          >
            <span class="w-2 h-2 rounded-full bg-[#ce93d8]"></span>
            Plot Threads
          </button>
        </div>

        <button
          class="p-1.5 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent"
          :title="showSidebar ? 'Hide sidebar' : 'Show sidebar'"
          @click="toggleSidebar"
        >
          <BaseIcon :name="showSidebar ? 'panel-left-close' : 'panel-left-open'" :size="18" />
        </button>
        <button
          class="p-1.5 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent"
          title="Add group"
          @click="openCreateGroupModal"
        >
          <BaseIcon name="folder-plus" :size="18" />
        </button>
        <button
          class="p-1.5 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent"
          title="Extended star layout - group clusters with mini-stars"
          @click="arrangeExtendedStarLayout"
        >
          <BaseIcon name="circle" :size="18" />
        </button>
        <button
          class="px-3 py-1.5 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover font-ui flex items-center gap-1.5"
          title="Automatically generate connections"
          @click="openAutoGenerateModal"
        >
          <BaseIcon name="sparkles" :size="14" />
          Auto-generate
        </button>
        <button
          class="px-3 py-1.5 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover font-ui flex items-center gap-1.5"
          title="Get AI suggestions"
          @click="handleGetSuggestions"
        >
          <BaseIcon name="lightbulb" :size="14" />
          Ideas
        </button>
        <button
          class="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
          @click="openAddConnectionModal"
        >
          + Connection
        </button>
      </div>
    </div>

    <div class="flex-1 flex relative overflow-hidden">
      <Transition name="slide">
        <EntitySidebar
          v-if="showSidebar"
          :characters="storyBibleStore.characters"
          :locations="storyBibleStore.locations"
          :plot-threads="storyBibleStore.plotThreads"
          :existing-node-ids="existingNodeIds"
          :edges="storyGraphStore.edges"
          class="w-64 shrink-0 absolute md:relative z-10 h-full"
          @quick-add="handleQuickAdd"
          @toggle-sidebar="toggleSidebar"
          @edit-connection="editConnection"
          @delete-connection="handleSidebarDeleteConnection"
        />
      </Transition>

      <div class="flex-1 relative" style="height: 100%;">
        <VueFlow
          v-if="nodes.length > 0 || manualGroups.length > 0"
          :key="forceRefreshKey"
          :nodes="nodes"
          :edges="[...edges, ...groupEdges]"
          :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          :min-zoom="0.2"
          :max-zoom="2"
          fit-view-on-init
          class="story-network"
          :class="{ 'drag-over': isDraggingOver }"
          style="height: 100%; width: 100%; position: relative;"
          @node-double-click="handleNodeDoubleClick"
          @edge-click="handleEdgeClick"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @connect="handleConnect"
        >
          <template #edge-custom="{ id, sourceX, sourceY, targetX, targetY, data }">
            <path
              v-if="data?.category === 'group' || (data?.category === 'char' && showCharEdges) || (data?.category === 'loc' && showLocEdges) || (data?.category === 'thread' && showThreadEdges)"
              :d="getBezierPath(sourceX, sourceY + (data?.staggerOffset || 0), targetX, targetY + (data?.staggerOffset || 0), data?.isLongRange)"
              :stroke="data?.color || '#888'"
              :stroke-width="data?.category === 'group' ? (hoveredEdgeId === id ? 3.5 : 2.5) : (hoveredEdgeId === id ? 3 : 1.5)"
              :stroke-dasharray="data?.category === 'group' ? '6 3' : undefined"
              :opacity="getEdgeOpacity(id)"
              fill="none"
              class="edge-path"
              @mouseenter="hoveredEdgeId = id"
              @mouseleave="hoveredEdgeId = null"
            />
            <foreignObject
              v-if="data?.category === 'group' || (data?.category === 'char' && showCharEdges) || (data?.category === 'loc' && showLocEdges) || (data?.category === 'thread' && showThreadEdges)"
              :x="(sourceX + targetX) / 2 - 40"
              :y="(sourceY + targetY) / 2 + (data?.staggerOffset || 0) - 10"
              width="80"
              height="20"
              class="edge-label-container"
            >
              <div
                class="edge-label"
                :style="{ opacity: getEdgeOpacity(id) }"
              >
                {{ data?.label || '' }}
              </div>
            </foreignObject>
          </template>
          <template #node-character="{ data, id }">
            <div 
              class="node-card" 
              :style="{ borderColor: data.color }"
              @mouseenter="handleNodeMouseEnter({ id })"
              @mouseleave="handleNodeMouseLeave"
            >
              <div class="flex items-center gap-2">
                <BaseIcon :name="data.iconName" :size="16" :style="{ color: data.color }" />
                <span class="font-medium text-sm text-text-primary node-label" :title="data.label">{{ data.label }}</span>
              </div>
              <span v-if="data.sublabel" class="text-[10px] text-text-hint node-sublabel" :title="data.sublabel">{{ data.sublabel }}</span>
            </div>
          </template>
          
          <template #node-location="{ data, id }">
            <div 
              class="node-card" 
              :style="{ borderColor: data.color }"
              @mouseenter="handleNodeMouseEnter({ id })"
              @mouseleave="handleNodeMouseLeave"
            >
              <div class="flex items-center gap-2">
                <BaseIcon :name="data.iconName" :size="16" :style="{ color: data.color }" />
                <span class="font-medium text-sm text-text-primary node-label" :title="data.label">{{ data.label }}</span>
              </div>
              <span v-if="data.sublabel" class="text-[10px] text-text-hint node-sublabel" :title="data.sublabel">{{ data.sublabel }}</span>
            </div>
          </template>
          
          <template #node-plotThread="{ data, id }">
            <div 
              class="node-card" 
              :style="{ borderColor: data.color }"
              @mouseenter="handleNodeMouseEnter({ id })"
              @mouseleave="handleNodeMouseLeave"
            >
              <div class="flex items-center gap-2">
                <BaseIcon :name="data.iconName" :size="16" :style="{ color: data.color }" />
                <span class="font-medium text-sm text-text-primary node-label" :title="data.label">{{ data.label }}</span>
              </div>
              <span v-if="data.sublabel" class="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary node-sublabel" :title="data.sublabel">{{ data.sublabel }}</span>
            </div>
          </template>

          <template #node-group="{ data, id }">
            <div
              class="w-full h-full rounded-lg border group-node overflow-hidden"
              :style="{
                borderColor: data.color + '60',
                backgroundColor: dragOverGroupId === id ? data.color + '25' : data.color + '0D',
                boxShadow: dragOverGroupId === id ? `0 0 0 2px ${data.color}` : 'none',
                transition: 'background-color 0.15s, box-shadow 0.15s'
              }"
            >
              <div class="h-1 w-full" :style="{ backgroundColor: data.color }" />
              <div class="flex items-center justify-between px-2 py-1.5 gap-1">
                <button
                  class="w-3 h-3 rounded-full shrink-0 border border-white/20 hover:scale-125 transition-transform cursor-pointer"
                  :style="{ backgroundColor: data.color }"
                  title="Change color"
                  @click.stop="cycleGroupColor(id)"
                />
                <input
                  :value="data.label"
                  class="bg-transparent text-xs font-semibold text-text-primary outline-none flex-1 min-w-0"
                  placeholder="Group name"
                  @change="renameGroup(id, $event.target.value)"
                  @click.stop
                  @mousedown.stop
                />
                <span v-if="data.nodeCount" class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-mono" :style="{ backgroundColor: data.color + '30', color: data.color }">
                  {{ data.nodeCount }}
                </span>
                <button 
                  class="p-1 rounded shrink-0 text-text-hint hover:text-danger hover:bg-danger/10 transition-colors" 
                  title="Delete group"
                  @click.stop="deleteGroup(id)"
                >
                  <BaseIcon name="trash-2" :size="12" />
                </button>
              </div>
              <div
                class="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize group-resize-handle"
                title="Resize"
                @mousedown.stop="startGroupResize($event, id)"
              >
                <svg viewBox="0 0 10 10" class="w-full h-full opacity-30 hover:opacity-70 transition-opacity">
                  <path d="M 10 0 L 10 10 L 0 10" :fill="data.color" />
                </svg>
              </div>
              <Handle id="source" type="source" :position="Position.Right" class="!bg-accent !w-3 !h-3 !border-2 !border-white" />
              <Handle id="target" type="target" :position="Position.Left" class="!bg-accent !w-3 !h-3 !border-2 !border-white" />
            </div>
          </template>

          <Background pattern-color="#e5e7eb" :gap="20" />
        </VueFlow>

        <div v-if="nodes.length === 0 && manualGroups.length === 0" class="absolute inset-0 flex items-center justify-center bg-bg-secondary">
          <div class="text-center">
            <BaseIcon name="network" :size="48" class="mx-auto text-text-hint mb-4" />
            <p class="text-text-hint font-ui mb-2">No entities to visualize</p>
            <p class="text-xs text-text-hint mb-4">Drag items from the sidebar to add them</p>
            <button
              v-if="!showSidebar"
              class="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
              @click="toggleSidebar"
            >
              Show Entities Panel
            </button>
          </div>
        </div>

        <Transition name="fade">
          <div
            v-if="isDraggingOver && (nodes.length > 0 || manualGroups.length > 0)"
            class="absolute inset-0 pointer-events-none border-2 border-dashed border-accent/50 bg-accent/5 flex items-center justify-center"
          >
            <div class="bg-bg-tertiary/90 px-6 py-3 rounded-lg shadow-lg">
              <p class="text-text-secondary font-ui">Drop to add to network</p>
            </div>
          </div>
        </Transition>

        <div v-if="selectedConnection" class="absolute bottom-4 left-4 right-4 bg-bg-tertiary rounded-lg border border-border-subtle p-4 shadow-lg">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-medium text-sm text-text-primary">Connection Details</h3>
            <button class="text-text-hint hover:text-text-primary" @click="selectedConnection = null">
              <BaseIcon name="x" :size="16" />
            </button>
          </div>
          <div class="text-sm text-text-secondary mb-3">
            <span class="capitalize">{{ selectedConnection.sourceType }}</span> 
            <span class="text-text-hint mx-1">→</span>
            <span class="capitalize">{{ selectedConnection.relationshipType.replace('_', ' ') }}</span>
            <span class="text-text-hint mx-1">→</span>
            <span class="capitalize">{{ selectedConnection.targetType }}</span>
          </div>
          <p v-if="selectedConnection.description" class="text-xs text-text-hint mb-3">
            {{ selectedConnection.description }}
          </p>
          <div class="flex gap-2">
            <button
              class="flex-1 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
              @click="editConnection(selectedConnection)"
            >
              Edit
            </button>
            <button
              class="px-4 py-1.5 text-xs text-danger hover:bg-danger/10 rounded font-ui"
              @click="deleteConnection(selectedConnection)"
            >
              Delete
            </button>
          </div>
        </div>

        
      </div>
    </div>

    <AddConnectionModal
      :show="showConnectionModal"
      :existing-edge="editingEdge"
      :source-node="nodeToConnect"
      :target-node="targetNodeToConnect"
      :removable-node="nodeToConnect"
      :characters="storyBibleStore.characters"
      :locations="storyBibleStore.locations"
      :plot-threads="storyBibleStore.plotThreads"
      :groups="manualGroups"
      :existing-edges="storyGraphStore.edges"
      @close="showConnectionModal = false; nodeToConnect = null; targetNodeToConnect = null"
      @save="handleSaveConnection"
      @save-group-edge="handleSaveGroupEdge"
      @remove-node="handleRemoveNode"
    />

    <SuggestionsModal
      :show="showSuggestionsModal"
      :suggestions="networkSuggestions.suggestions"
      :is-analyzing="networkSuggestions.isAnalyzing"
      :error="networkSuggestions.analysisError"
      @close="showSuggestionsModal = false"
      @apply="handleApplySuggestions"
    />

    <ApplySuggestionsModal
      :show="showApplySuggestionsModal"
      :suggestions="pendingSuggestions"
      :groups="pendingGroups"
      @close="showApplySuggestionsModal = false; pendingSuggestions = []; pendingGroups = []"
      @apply="handleApplyPendingSuggestions"
    />

    <AutoGenerateModal
      :show="showAutoGenerateModal"
      :prompt="autoGeneratePrompt"
      :create-groups="autoGenerateCreateGroups"
      :from-scratch="autoGenerateFromScratch"
      :existing-connections="storyGraphStore.edges.length"
      :existing-groups="manualGroups.length"
      @close="showAutoGenerateModal = false"
      @generate="handleAutoGenerate"
      @update:prompt="autoGeneratePrompt = $event"
      @update:create-groups="autoGenerateCreateGroups = $event"
      @update:from-scratch="autoGenerateFromScratch = $event"
    />

    <Teleport to="body">
      <div
        v-if="showCreateGroupModal"
        class="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/50"
        @click.self="showCreateGroupModal = false"
      >
        <div class="bg-bg-tertiary rounded-xl border border-border-subtle shadow-xl w-72">
          <div class="p-4">
            <h3 class="text-sm font-semibold text-text-primary mb-3">New Group</h3>
            <input
              v-model="newGroupName"
              class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary text-sm mb-3"
              placeholder="Group name..."
              autofocus
              @keyup.enter="confirmCreateGroup"
            />
            <div class="flex gap-2 flex-wrap mb-4">
              <button
                v-for="color in groupColors"
                :key="color"
                class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                :class="newGroupColor === color ? 'border-white scale-110' : 'border-transparent'"
                :style="{ backgroundColor: color }"
                @click="newGroupColor = color"
              />
            </div>
            <div class="flex gap-2">
              <button class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg text-sm hover:bg-surface-hover font-ui" @click="showCreateGroupModal = false">Cancel</button>
              <button class="flex-1 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 font-ui" @click="confirmCreateGroup">Create</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.story-network {
  background: #1e1e2e;
}

.story-network.drag-over {
  background: #252538;
}

.node-card {
  background: #2a2a3e;
  border: 2px solid;
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 120px;
  max-width: 180px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  cursor: grab;
}

.node-card:active {
  cursor: grabbing;
}

.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

.node-sublabel {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.edge-path {
  cursor: pointer;
  transition: stroke-width 0.15s ease, opacity 0.15s ease;
}

.edge-label-container {
  overflow: visible;
}

.edge-label {
  background: #1a1a2e;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  color: #9ca3af;
  font-family: inherit;
  white-space: nowrap;
  text-align: center;
  transition: opacity 0.15s ease;
}

:deep(.vue-flow__edge) {
  stroke: transparent;
}

:deep(.vue-flow__handle) {
  width: 8px;
  height: 8px;
  background: #6366f1;
  border: none;
}

:deep(.vue-flow__pane) {
  cursor: default;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.group-node {
  position: relative;
}

.group-resize-handle {
  opacity: 0.5;
  transition: all 0.15s;
}

.group-resize-handle:hover {
  opacity: 1;
}
</style>
