import { ref } from 'vue'
import BaseSelect from './BaseSelect.vue'

export default {
  title: 'UI/BaseSelect',
  component: BaseSelect,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    hint: { control: 'text' }
  }
}

const OPTIONS = [
  { value: 'qwen3:8b', label: 'qwen3:8b' },
  { value: 'qwen2.5:3b-instruct', label: 'qwen2.5:3b-instruct' },
  { value: 'gemma3:4b', label: 'gemma3:4b (not pulled)', disabled: true }
]

const Template = (args) => ({
  components: { BaseSelect },
  setup: () => ({ args, v: ref('qwen3:8b'), OPTIONS }),
  template:
    '<div class="w-[320px]"><BaseSelect v-bind="args" :options="OPTIONS" v-model="v" label="Critic model" /><p class="mt-2 text-xs text-text-hint">value: {{ v }}</p></div>'
})

export const Default = Template.bind({})
Default.args = { hint: 'Leave empty to inherit the utility model.', placeholder: 'Inherit' }

export const Small = Template.bind({})
Small.args = { size: 'sm', placeholder: 'Inherit' }

export const WithError = Template.bind({})
WithError.args = { error: 'A second GPU model evicts the first.' }

export const Disabled = Template.bind({})
Disabled.args = { disabled: true, hint: 'Only used by the LangGraph orchestrator.' }
