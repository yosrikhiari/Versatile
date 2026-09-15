import { ref } from 'vue'
import BaseSwitch from './BaseSwitch.vue'

export default {
  title: 'UI/BaseSwitch',
  component: BaseSwitch,
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' }
  }
}

const Template = (args) => ({
  components: { BaseSwitch },
  setup: () => ({ args, on: ref(!!args.on) }),
  template: '<BaseSwitch v-bind="args" v-model="on" />'
})

export const Off = Template.bind({})
Off.args = { label: 'Focus mode' }

export const On = Template.bind({})
On.args = { label: 'Focus mode', on: true }

export const WithDescription = Template.bind({})
WithDescription.args = {
  label: 'Consistency gate',
  description: 'Warns on contradictions; never discards prose.',
  on: true
}

export const Small = Template.bind({})
Small.args = { label: 'Show word count', size: 'sm', on: true }

export const Disabled = Template.bind({})
Disabled.args = {
  label: 'Cloud fallback',
  description: 'Add a provider key to enable.',
  disabled: true
}
