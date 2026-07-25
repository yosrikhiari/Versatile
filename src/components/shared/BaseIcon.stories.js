import BaseIcon from './BaseIcon.vue'

export default {
  title: 'Shared/BaseIcon',
  component: BaseIcon,
  argTypes: {
    name: { control: 'text' },
    size: { control: 'number' },
    strokeWidth: { control: 'number' }
  }
}

const Template = (args) => ({
  components: { BaseIcon },
  setup: () => ({ args }),
  template: '<BaseIcon v-bind="args" />'
})

const IconGrid = (args) => ({
  components: { BaseIcon },
  setup: () => ({ args }),
  template: `
    <div class="flex flex-wrap gap-3 p-4">
      <div v-for="icon in args.icons" :key="icon" class="flex flex-col items-center gap-1 p-2 rounded-lg bg-bg-tertiary w-16">
        <BaseIcon :name="icon" :size="args.size || 20" />
        <span class="text-2xs text-text-hint truncate w-full text-center">{{ icon }}</span>
      </div>
    </div>
  `
})

export const Default = Template.bind({})
Default.args = { name: 'home', size: 20 }

export const Small = Template.bind({})
Small.args = { name: 'home', size: 14 }

export const Large = Template.bind({})
Large.args = { name: 'home', size: 32 }

export const ThinStroke = Template.bind({})
ThinStroke.args = { name: 'home', size: 20, strokeWidth: 1 }

export const BoldStroke = Template.bind({})
BoldStroke.args = { name: 'home', size: 20, strokeWidth: 2.5 }

export const CommonIcons = IconGrid.bind({})
CommonIcons.args = {
  icons: [
    'home',
    'settings',
    'user',
    'book',
    'search',
    'plus',
    'x',
    'check',
    'arrow-right',
    'alert-circle',
    'loader-2',
    'bot',
    'scroll-text',
    'database',
    'pen-tool',
    'sparkles',
    'inbox',
    'alert-triangle'
  ],
  size: 20
}
