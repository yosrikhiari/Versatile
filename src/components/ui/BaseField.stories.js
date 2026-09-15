import { ref } from 'vue'
import BaseField from './BaseField.vue'

export default {
  title: 'UI/BaseField',
  component: BaseField,
  argTypes: {
    label: { control: 'text' },
    type: { control: 'select', options: ['text', 'number', 'email', 'password', 'search'] },
    placeholder: { control: 'text' },
    icon: { control: 'text' },
    suffix: { control: 'text' },
    hint: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    rows: { control: 'number' }
  }
}

const Template = (args) => ({
  components: { BaseField },
  setup: () => ({ args, value: ref(args.value ?? '') }),
  template: '<div class="max-w-sm"><BaseField v-bind="args" v-model="value" /></div>'
})

export const Default = Template.bind({})
Default.args = { label: 'Chapter title', placeholder: 'The long night' }

export const WithIcon = Template.bind({})
WithIcon.args = {
  label: 'Search the story bible',
  icon: 'search',
  placeholder: 'Character, place, thread',
  type: 'search'
}

export const WithSuffix = Template.bind({})
WithSuffix.args = { label: 'Target length', type: 'number', suffix: 'words', value: '2400' }

export const WithHint = Template.bind({})
WithHint.args = { label: 'Project name', hint: 'Shown in the workspace and the export filename.' }

export const WithError = Template.bind({})
WithError.args = {
  label: 'API key',
  type: 'password',
  error: 'The key was rejected by the provider.',
  value: 'sk-xxxx'
}

export const Required = Template.bind({})
Required.args = { label: 'Scene title', required: true }

export const Disabled = Template.bind({})
Disabled.args = { label: 'Model', value: 'qwen3:8b', disabled: true }

export const Multiline = Template.bind({})
Multiline.args = {
  label: 'Scene summary',
  rows: 4,
  placeholder: 'What has to happen in this scene?',
  hint: 'Used as the generation brief.'
}
