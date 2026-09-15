import { ref } from 'vue'
import BaseRadio from './BaseRadio.vue'

export default {
  title: 'UI/BaseRadio',
  component: BaseRadio,
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    disabled: { control: 'boolean' }
  }
}

export const Group = () => ({
  components: { BaseRadio },
  setup: () => ({ mode: ref('scene') }),
  template: `
    <div class="flex flex-col gap-2">
      <BaseRadio v-model="mode" name="mode" value="scene" label="Scene" description="One scene from a brief." />
      <BaseRadio v-model="mode" name="mode" value="chapter" label="Chapter" description="Plan, then write every scene." />
      <BaseRadio v-model="mode" name="mode" value="arc" label="Arc" description="Several chapters against the outline." />
      <BaseRadio v-model="mode" name="mode" value="cloud" label="Cloud only" description="Needs an API key." disabled />
      <p class="text-xs text-text-hint">mode: {{ mode }}</p>
    </div>`
})

export const Single = (args) => ({
  components: { BaseRadio },
  setup: () => ({ args, v: ref('a') }),
  template: '<BaseRadio v-bind="args" v-model="v" name="single" value="a" />'
})
Single.args = {
  label: 'Selected radio',
  description: 'A lone radio is checked when modelValue === value.'
}
