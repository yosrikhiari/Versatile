import BaseAlert from './BaseAlert.vue'
import BaseButton from './BaseButton.vue'

export default {
  title: 'UI/BaseAlert',
  component: BaseAlert,
  argTypes: {
    variant: { control: 'select', options: ['info', 'success', 'warning', 'danger'] },
    title: { control: 'text' },
    icon: { control: 'text' },
    dismissible: { control: 'boolean' },
    flush: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseAlert },
  setup: () => ({ args }),
  template: '<BaseAlert v-bind="args">{{ args.default }}</BaseAlert>'
})

export const Info = Template.bind({})
Info.args = {
  variant: 'info',
  title: 'Ollama is starting',
  default: 'The first request may take a few seconds.'
}

export const Success = Template.bind({})
Success.args = {
  variant: 'success',
  title: 'Snapshot saved',
  default: 'You can restore it from the Snapshots panel.'
}

export const Warning = Template.bind({})
Warning.args = {
  variant: 'warning',
  title: 'Context is nearly full',
  default: 'Older scenes will be summarised for the next generation.'
}

export const Danger = Template.bind({})
Danger.args = {
  variant: 'danger',
  title: 'Model unavailable',
  default: 'qwen3:8b is not pulled. Run ollama pull qwen3:8b.'
}

export const Dismissible = Template.bind({})
Dismissible.args = {
  variant: 'info',
  dismissible: true,
  default: 'A dismissible notice. The dismiss event is emitted; the parent hides it.'
}

export const Flush = Template.bind({})
Flush.args = {
  variant: 'warning',
  flush: true,
  default: 'Flush: no rounded border, for the top of a panel.'
}

export const WithActions = () => ({
  components: { BaseAlert, BaseButton },
  template: `
    <BaseAlert variant="danger" title="Generation failed">
      The provider returned an empty envelope. The best attempt was kept as review.
      <template #actions>
        <BaseButton variant="ghost" size="sm">Open scene</BaseButton>
        <BaseButton variant="secondary" size="sm">Retry</BaseButton>
      </template>
    </BaseAlert>`
})
