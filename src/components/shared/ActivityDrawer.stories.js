import ActivityDrawer from './ActivityDrawer.vue'
import { useActivityLog } from '../../composables/useActivityLog'

export default {
  title: 'Shared/ActivityDrawer',
  component: ActivityDrawer,
  argTypes: {
    tasks: { control: 'object' },
    drawerOpen: { control: 'boolean' }
  }
}

const activeGen = {
  id: 't1',
  name: 'Generating chapter 5',
  type: 'generation',
  progress: { label: 'Generating…', percent: 50 },
  phases: [
    { id: 'p1', name: 'Analyzing context', status: 'done', duration: 1200 },
    { id: 'p2', name: 'Generating prose', status: 'running', duration: 3400 }
  ],
  thoughtChunks: ['Establishing scene atmosphere…', 'Drafting dialogue for protagonist…'],
  startedAt: Date.now() - 8000
}

const activeCritic = {
  id: 't2',
  name: 'Reviewing plot consistency',
  type: 'critic',
  progress: { label: 'Analyzing timeline…', percent: 30 },
  phases: [{ id: 'p3', name: 'Scanning chapters', status: 'running', duration: 2100 }],
  thoughtChunks: ['Checking date references across chapters 1-4…'],
  startedAt: Date.now() - 3000
}

const completedTask = {
  id: 't3',
  name: 'Bootstrapping character sheet',
  type: 'bootstrap',
  progress: { label: 'Done', percent: 100 },
  phases: [
    { id: 'p4', name: 'Extracting names', status: 'done', duration: 800 },
    { id: 'p5', name: 'Mapping relationships', status: 'done', duration: 1500 },
    { id: 'p6', name: 'Generating traits', status: 'done', duration: 900 }
  ],
  startedAt: Date.now() - 30000
}

const failedTask = {
  id: 't4',
  name: 'Syncing to cloud',
  type: 'spark',
  progress: { label: 'Failed', percent: 0 },
  phases: [
    { id: 'p7', name: 'Connecting…', status: 'done', duration: 500 },
    { id: 'p8', name: 'Uploading', status: 'failed', duration: 1200 }
  ],
  thoughtChunks: ['Connection timeout after 3 retries'],
  startedAt: Date.now() - 15000
}

const mixedTasks = [activeGen, activeCritic, completedTask, failedTask]

const Template = (args) => ({
  components: { ActivityDrawer },
  setup() {
    const log = useActivityLog()
    log.tasks.value = args.tasks
    log.drawerOpen.value = args.drawerOpen
    return {}
  },
  template: '<ActivityDrawer />'
})

export const MixedActivity = Template.bind({})
MixedActivity.args = {
  tasks: mixedTasks,
  drawerOpen: true
}

export const ManyActive = Template.bind({})
ManyActive.args = {
  tasks: [
    activeGen,
    activeCritic,
    {
      id: 't5',
      name: 'Analyzing story arc',
      type: 'spark',
      progress: { label: 'Scanning…', percent: 15 },
      phases: [{ id: 'p9', name: 'Scanning manuscript', status: 'running', duration: 600 }],
      thoughtChunks: [],
      startedAt: Date.now() - 2000
    },
    completedTask
  ],
  drawerOpen: true
}

export const Empty = Template.bind({})
Empty.args = {
  tasks: [],
  drawerOpen: true
}
