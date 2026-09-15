import { ref } from 'vue'
import BaseCheckbox from './BaseCheckbox.vue'

export default {
  title: 'UI/BaseCheckbox',
  component: BaseCheckbox,
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    disabled: { control: 'boolean' },
    indeterminate: { control: 'boolean' }
  }
}

const Template = (args) => ({
  components: { BaseCheckbox },
  setup: () => ({ args, checked: ref(!!args.checked) }),
  template: '<BaseCheckbox v-bind="args" v-model="checked" />'
})

export const Default = Template.bind({})
Default.args = { label: 'Include in export' }

export const Checked = Template.bind({})
Checked.args = { label: 'Include in export', checked: true }

export const WithDescription = Template.bind({})
WithDescription.args = {
  label: 'Run the consistency gate',
  description: 'Warns on contradictions with the story bible; never discards prose.'
}

export const Indeterminate = Template.bind({})
Indeterminate.args = { label: 'All chapters', indeterminate: true }

export const Disabled = Template.bind({})
Disabled.args = { label: 'Requires a cloud provider', disabled: true }

export const Group = () => ({
  components: { BaseCheckbox },
  setup: () => ({ picked: ref(['chapters']) }),
  template: `
    <div class="flex flex-col gap-2">
      <BaseCheckbox v-model="picked" value="chapters" label="Chapters" />
      <BaseCheckbox v-model="picked" value="scenes" label="Scenes" />
      <BaseCheckbox v-model="picked" value="notes" label="Notes" description="Story-bible notes attached to a scene" />
      <p class="text-xs text-text-hint">picked: {{ picked.join(', ') || '-' }}</p>
    </div>`
})
