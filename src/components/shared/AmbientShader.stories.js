import AmbientShader from './AmbientShader.vue'

export default {
  title: 'Shared/AmbientShader',
  component: AmbientShader,
  argTypes: {
    speed: { control: { type: 'number', min: 1, max: 5, step: 1 } },
    colorScheme: { control: 'select', options: ['default', 'warm', 'cool', 'forest'] }
  }
}

const Template = (args) => ({
  components: { AmbientShader },
  setup() {
    return { args }
  },
  template: '<div class="h-96 w-full relative"><AmbientShader v-bind="args" /></div>'
})

export const Default = Template.bind({})
Default.args = {}

export const Slow = Template.bind({})
Slow.args = { speed: 1 }

export const Fast = Template.bind({})
Fast.args = { speed: 5 }

export const WarmTones = Template.bind({})
WarmTones.args = { colorScheme: 'warm' }

export const CoolTones = Template.bind({})
CoolTones.args = { colorScheme: 'cool' }

export const ForestTones = Template.bind({})
ForestTones.args = { colorScheme: 'forest' }
