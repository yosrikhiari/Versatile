import Skeleton from './Skeleton.vue'

export default {
  title: 'Shared/Skeleton',
  component: Skeleton,
  argTypes: {
    variant: {
      control: 'select',
      options: ['line', 'text', 'circle', 'card', 'list', 'panel']
    },
    count: { control: { type: 'number', min: 1, max: 8 } },
    width: { control: 'text' },
    height: { control: 'text' },
    size: { control: 'text' },
    label: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { Skeleton },
  setup: () => ({ args }),
  template: '<div style="max-width: 420px"><Skeleton v-bind="args" /></div>'
})

export const Line = Template.bind({})
Line.args = { variant: 'line', width: '60%', height: '0.75rem' }

export const Text = Template.bind({})
Text.args = { variant: 'text', count: 4 }

export const Circle = Template.bind({})
Circle.args = { variant: 'circle', size: '3rem' }

export const Card = Template.bind({})
Card.args = { variant: 'card' }

export const List = Template.bind({})
List.args = { variant: 'list', count: 4 }

export const Panel = Template.bind({})
Panel.args = { variant: 'panel', count: 3 }
