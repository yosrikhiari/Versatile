import { ref } from 'vue'
import BaseStepper from './BaseStepper.vue'

export default {
  title: 'UI/BaseStepper',
  component: BaseStepper,
  argTypes: {
    label: { control: 'text' },
    suffix: { control: 'text' },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' }
  }
}

const Template = (args) => ({
  components: { BaseStepper },
  setup: () => ({ args, v: ref(args.value ?? 0) }),
  template:
    '<BaseStepper v-bind="args" v-model="v" /><p class="mt-2 text-xs text-text-hint">value: {{ v }}</p>'
})

export const Default = Template.bind({})
Default.args = { label: 'Scenes per chapter', min: 1, max: 12, value: 4 }

export const WithSuffix = Template.bind({})
WithSuffix.args = {
  label: 'Target length',
  suffix: 'words',
  min: 200,
  max: 6000,
  step: 100,
  value: 1800
}

export const Small = Template.bind({})
Small.args = { label: 'Retries', size: 'sm', min: 0, max: 5, value: 2 }

export const Disabled = Template.bind({})
Disabled.args = { label: 'Temperature x10', value: 7, disabled: true }
