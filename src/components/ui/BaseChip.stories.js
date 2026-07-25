import BaseChip from './BaseChip.vue'

export default {
  title: 'UI/BaseChip',
  component: BaseChip,
  argTypes: {
    variant: { control: 'select', options: ['default', 'filter', 'removable'] },
    size: { control: 'select', options: ['sm', 'md'] },
    color: { control: 'select', options: ['accent', 'success', 'danger', 'warning', 'info'] },
    active: { control: 'boolean' },
    disabled: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseChip },
  setup: () => ({ args }),
  template: '<BaseChip v-bind="args">{{ args.default }}</BaseChip>'
})

export const Default = Template.bind({})
Default.args = { default: 'Tag' }

export const Filter = Template.bind({})
Filter.args = { default: 'Filter', variant: 'filter' }

export const FilterActive = Template.bind({})
FilterActive.args = { default: 'Active', variant: 'filter', active: true }

export const Removable = Template.bind({})
Removable.args = { default: 'Draft', variant: 'removable' }

export const ColorSuccess = Template.bind({})
ColorSuccess.args = { default: 'Success', color: 'success' }

export const ColorDanger = Template.bind({})
ColorDanger.args = { default: 'Danger', color: 'danger' }

export const ColorWarning = Template.bind({})
ColorWarning.args = { default: 'Warning', color: 'warning' }

export const ColorInfo = Template.bind({})
ColorInfo.args = { default: 'Info', color: 'info' }

export const SmallSize = Template.bind({})
SmallSize.args = { default: 'Sm', size: 'sm' }

export const MediumSize = Template.bind({})
MediumSize.args = { default: 'Md', size: 'md' }

export const Disabled = Template.bind({})
Disabled.args = { default: 'Disabled', variant: 'filter', disabled: true }
