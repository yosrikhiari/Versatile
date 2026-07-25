import AppTooltip from './AppTooltip.vue'

export default {
  title: 'Shared/AppTooltip',
  component: AppTooltip,
  argTypes: {
    text: { control: 'text' },
    position: { control: 'select', options: ['top', 'bottom', 'left', 'right'] }
  }
}

const Template = (args) => ({
  components: { AppTooltip },
  setup: () => ({ args }),
  template: `
    <div class="flex items-center justify-center min-h-[200px]">
      <AppTooltip v-bind="args">
        <button class="px-3 py-1.5 bg-accent text-bg-primary rounded-lg text-xs font-medium">Hover me</button>
      </AppTooltip>
    </div>
  `
})

export const Top = Template.bind({})
Top.args = { text: 'Tooltip on top', position: 'top' }

export const Bottom = Template.bind({})
Bottom.args = { text: 'Tooltip on bottom', position: 'bottom' }

export const Left = Template.bind({})
Left.args = { text: 'Tooltip on left', position: 'left' }

export const Right = Template.bind({})
Right.args = { text: 'Tooltip on right', position: 'right' }

export const LongText = Template.bind({})
LongText.args = {
  text: 'This is a much longer tooltip that should wrap to multiple lines to demonstrate text wrapping behavior',
  position: 'top'
}
