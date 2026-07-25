import BaseButton from './BaseButton.vue'

export default {
  title: 'UI/BaseButton',
  component: BaseButton,
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'accent-ghost', 'elevated', 'outline']
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    icon: { control: 'text' },
    iconPosition: { control: 'select', options: ['left', 'right'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseButton },
  setup: () => ({ args }),
  template: '<BaseButton v-bind="args">{{ args.default }}</BaseButton>'
})

export const Primary = Template.bind({})
Primary.args = { default: 'Primary', variant: 'primary' }

export const Secondary = Template.bind({})
Secondary.args = { default: 'Secondary', variant: 'secondary' }

export const Ghost = Template.bind({})
Ghost.args = { default: 'Ghost', variant: 'ghost' }

export const Danger = Template.bind({})
Danger.args = { default: 'Danger', variant: 'danger' }

export const AccentGhost = Template.bind({})
AccentGhost.args = { default: 'Accent Ghost', variant: 'accent-ghost' }

export const Elevated = Template.bind({})
Elevated.args = { default: 'Elevated', variant: 'elevated' }

export const Outline = Template.bind({})
Outline.args = { default: 'Outline', variant: 'outline' }

export const Small = Template.bind({})
Small.args = { default: 'Small', variant: 'primary', size: 'sm' }

export const Large = Template.bind({})
Large.args = { default: 'Large', variant: 'primary', size: 'lg' }

export const Disabled = Template.bind({})
Disabled.args = { default: 'Disabled', variant: 'primary', disabled: true }

export const Loading = Template.bind({})
Loading.args = { default: 'Loading', variant: 'primary', loading: true }

export const WithIcon = Template.bind({})
WithIcon.args = { default: 'Settings', variant: 'primary', icon: 'settings' }

export const IconRight = Template.bind({})
IconRight.args = { default: 'Next', variant: 'primary', icon: 'arrow-right', iconPosition: 'right' }
