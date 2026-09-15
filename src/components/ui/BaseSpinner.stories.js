import BaseSpinner from './BaseSpinner.vue'

export default {
  title: 'UI/BaseSpinner',
  component: BaseSpinner,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    label: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseSpinner },
  setup: () => ({ args }),
  template: '<BaseSpinner v-bind="args" />'
})

export const Medium = Template.bind({})
Medium.args = { size: 'md' }

export const Small = Template.bind({})
Small.args = { size: 'sm', label: 'Saving' }

export const Large = Template.bind({})
Large.args = { size: 'lg', label: 'Generating chapter' }

export const AllSizes = () => ({
  components: { BaseSpinner },
  template:
    '<div class="flex items-center gap-6"><BaseSpinner size="sm" /><BaseSpinner size="md" /><BaseSpinner size="lg" /></div>'
})
