import DatabaseRecovery from './DatabaseRecovery.vue'

export default {
  title: 'Shared/DatabaseRecovery',
  component: DatabaseRecovery
}

const Template = (args) => ({
  components: { DatabaseRecovery },
  setup() {
    return { args }
  },
  template: '<DatabaseRecovery v-bind="args" />'
})

export const Initial = Template.bind({})
Initial.args = {}

export const Healthy = Template.bind({})
Healthy.args = {
  simulatedState: {
    healthCheck: {
      healthy: true,
      stores: {
        scenes: { status: 'ok', count: 142 },
        characters: { status: 'ok', count: 38 },
        chapters: { status: 'ok', count: 12 }
      }
    },
    dbSize: { sizeMB: 4.2, sizeKB: 4300 },
    status: { type: 'success', message: 'Database is healthy!' }
  }
}

export const Unhealthy = Template.bind({})
Unhealthy.args = {
  simulatedState: {
    healthCheck: {
      healthy: false,
      stores: {
        scenes: { status: 'ok', count: 142 },
        characters: { status: 'error', count: 0 },
        chapters: { status: 'ok', count: 12 }
      }
    },
    dbSize: { sizeMB: 4.2, sizeKB: 4300 },
    status: { type: 'error', message: 'Database has issues. Consider exporting your data.' }
  }
}

export const ResetConfirmation = Template.bind({})
ResetConfirmation.args = {
  simulatedState: {
    showResetConfirm: true
  }
}

export const Working = Template.bind({})
Working.args = {
  simulatedState: {
    working: true
  }
}
