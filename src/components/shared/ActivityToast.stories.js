import ActivityToast from './ActivityToast.vue'
import { useActivityLog } from '../../composables/useActivityLog'

export default {
  title: 'Shared/ActivityToast',
  component: ActivityToast,
  argTypes: {
    tasks: { control: 'object' },
    toastsVisible: { control: 'boolean' }
  }
}

const mockTask = (id, name, type, phaseStatus = 'running') => ({
  id,
  name,
  type,
  progress: { label: name, percent: 50 },
  phases: [{ name: 'Generating…', status: phaseStatus }],
  startedAt: Date.now() - 5000
})

const singleTask = [mockTask('t1', 'Generating chapter 5', 'generation')]
const multipleTasks = [
  mockTask('t1', 'Generating chapter 5', 'generation'),
  mockTask('t2', 'Reviewing plot consistency', 'critic'),
  mockTask('t3', 'Bootstrapping character sheet', 'bootstrap')
]
const sparkTask = [mockTask('t4', 'Analyzing story arc', 'spark')]
const revisorTask = [mockTask('t5', 'Polishing prose', 'revisor')]

const Template = (args) => ({
  components: { ActivityToast },
  setup() {
    const log = useActivityLog()
    log.tasks.value = args.tasks
    log.toastsVisible.value = args.toastsVisible
    return {}
  },
  template: '<ActivityToast />'
})

export const SingleRunning = Template.bind({})
SingleRunning.args = {
  tasks: singleTask,
  toastsVisible: true
}

export const MultipleRunning = Template.bind({})
MultipleRunning.args = {
  tasks: multipleTasks,
  toastsVisible: true
}

export const SparkType = Template.bind({})
SparkType.args = {
  tasks: sparkTask,
  toastsVisible: true
}

export const RevisorType = Template.bind({})
RevisorType.args = {
  tasks: revisorTask,
  toastsVisible: true
}

export const Hidden = Template.bind({})
Hidden.args = {
  tasks: multipleTasks,
  toastsVisible: false
}
