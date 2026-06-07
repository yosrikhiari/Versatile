import { ref, computed } from 'vue'

const tasks = ref([])
const toastsVisible = ref(true)
const drawerOpen = ref(false)
let taskIdCounter = 0
const THOUGHT_CAP = 100000

function addTask({ name, type }) {
  const id = `act-${++taskIdCounter}`
  const task = {
    id,
    name,
    type,
    status: 'running',
    phases: [],
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    progress: { current: 0, total: 0, label: '' }
  }
  tasks.value.push(task)
  return id
}

function updateTask(taskId, updates) {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) Object.assign(task, updates)
}

function completeTask(taskId) {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) {
    task.status = 'done'
    task.completedAt = Date.now()
    task.phases.forEach(p => { if (p.status === 'running') p.status = 'done' })
  }
}

function failTask(taskId, error) {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) {
    task.status = 'failed'
    task.error = error
    task.completedAt = Date.now()
    task.phases.forEach(p => { if (p.status === 'running') p.status = 'failed' })
  }
}

function addPhase(taskId, name) {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task) return -1
  const phase = {
    name,
    status: 'running',
    startedAt: Date.now(),
    elapsedMs: 0,
    thought: ''
  }
  task.phases.push(phase)
  return task.phases.length - 1
}

function updatePhase(taskId, phaseIndex, updates) {
  const task = tasks.value.find(t => t.id === taskId)
  if (task && task.phases[phaseIndex]) {
    Object.assign(task.phases[phaseIndex], updates)
  }
}

function appendThought(taskId, phaseIndex, chunk) {
  const task = tasks.value.find(t => t.id === taskId)
  if (task && task.phases[phaseIndex]) {
    const phase = task.phases[phaseIndex]
    phase.thought += chunk
    if (phase.thought.length > THOUGHT_CAP) {
      phase.thought = phase.thought.slice(-THOUGHT_CAP)
    }
  }
}

function clearCompleted() {
  tasks.value = tasks.value.filter(t => t.status === 'running')
}

function removeTask(taskId) {
  const idx = tasks.value.findIndex(t => t.id === taskId)
  if (idx !== -1) tasks.value.splice(idx, 1)
}

const activeTasks = computed(() => tasks.value.filter(t => t.status === 'running'))
const completedTasks = computed(() => tasks.value.filter(t => t.status === 'done' || t.status === 'failed'))

export function useActivityLog() {
  return {
    tasks,
    activeTasks,
    completedTasks,
    toastsVisible,
    drawerOpen,
    addTask,
    updateTask,
    completeTask,
    failTask,
    addPhase,
    updatePhase,
    appendThought,
    clearCompleted,
    removeTask
  }
}
