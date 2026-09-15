import { ref } from 'vue'
import BaseSegmented from './BaseSegmented.vue'

export default {
  title: 'UI/BaseSegmented',
  component: BaseSegmented,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    block: { control: 'boolean' },
    disabled: { control: 'boolean' }
  }
}

const OPTIONS = [
  { value: 'ideate', label: 'Ideate', icon: 'lightbulb' },
  { value: 'scene', label: 'Scene', icon: 'file-text' },
  { value: 'chapter', label: 'Chapter', icon: 'book' },
  { value: 'arc', label: 'Arc', icon: 'git-branch', disabled: true }
]

const Template = (args) => ({
  components: { BaseSegmented },
  setup: () => ({ args, v: ref('scene'), OPTIONS }),
  template:
    '<div class="w-[420px]"><BaseSegmented v-bind="args" :options="OPTIONS" v-model="v" aria-label="Generation mode" /><p class="mt-2 text-xs text-text-hint">value: {{ v }}. Arrow keys move between enabled options.</p></div>'
})

export const Default = Template.bind({})
Default.args = { size: 'md' }

export const Small = Template.bind({})
Small.args = { size: 'sm' }

export const Block = Template.bind({})
Block.args = { block: true }

export const Disabled = Template.bind({})
Disabled.args = { disabled: true }
