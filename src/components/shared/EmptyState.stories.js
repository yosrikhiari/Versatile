import EmptyState from './EmptyState.vue'

export default {
  title: 'Shared/EmptyState',
  component: EmptyState,
  argTypes: {
    icon: { control: 'text' },
    title: { control: 'text' },
    description: { control: 'text' },
    actionLabel: { control: 'text' },
    actionIcon: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { EmptyState },
  setup: () => ({ args }),
  template: '<EmptyState v-bind="args" />'
})

const WithSlot = (args) => ({
  components: { EmptyState },
  setup: () => ({ args }),
  template: `
    <EmptyState v-bind="args">
      <p class="text-xs text-text-hint mt-2">Custom slot content goes here</p>
    </EmptyState>
  `
})

export const Default = Template.bind({})
Default.args = {}

export const CustomIcon = Template.bind({})
CustomIcon.args = { icon: 'search' }

export const CustomTitle = Template.bind({})
CustomTitle.args = { title: 'No results found' }

export const WithDescription = Template.bind({})
WithDescription.args = {
  title: 'No chapters yet',
  description: 'Start writing to see your chapters appear here.'
}

export const WithAction = Template.bind({})
WithAction.args = {
  title: 'No characters',
  description: 'Create your first character to get started.',
  actionLabel: 'Add Character',
  actionIcon: 'plus'
}

export const WithSlotContent = WithSlot.bind({})
WithSlotContent.args = {
  title: 'Import data',
  description: 'Upload a backup file to restore your data.',
  actionLabel: 'Import'
}
