import BaseStatusDot from './BaseStatusDot.vue'

export default {
  title: 'UI/BaseStatusDot',
  component: BaseStatusDot,
  argTypes: {
    color: { control: 'text' },
    label: { control: 'text' },
    shape: { control: 'select', options: ['solid', 'dashed', 'ring', 'half', 'target', 'check'] },
    size: { control: 'select', options: ['sm', 'md'] },
    pill: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseStatusDot },
  setup: () => ({ args }),
  template: '<BaseStatusDot v-bind="args">{{ args.default }}</BaseStatusDot>'
})

export const Solid = Template.bind({})
Solid.args = {
  shape: 'solid',
  color: 'var(--vers-status-success)',
  label: 'Resolved',
  default: 'Resolved'
}

export const Pill = Template.bind({})
Pill.args = { shape: 'check', color: 'var(--vers-status-success)', pill: true, default: 'Final' }

export const PlotThreadLifecycle = () => ({
  components: { BaseStatusDot },
  template: `
    <div class="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
      <BaseStatusDot shape="dashed" color="var(--vers-status-open)" label="Open">Open</BaseStatusDot>
      <BaseStatusDot shape="half" color="var(--vers-status-in_progress)" label="In progress">In progress</BaseStatusDot>
      <BaseStatusDot shape="target" color="var(--vers-accent-primary)" label="Climax">Climax</BaseStatusDot>
      <BaseStatusDot shape="check" color="var(--vers-status-resolved)" label="Resolved">Resolved</BaseStatusDot>
      <BaseStatusDot shape="ring" color="var(--vers-status-closed)" label="Closed">Closed</BaseStatusDot>
    </div>`
})

export const Small = Template.bind({})
Small.args = { shape: 'solid', size: 'sm', color: 'var(--vers-status-warning)', default: 'Review' }
