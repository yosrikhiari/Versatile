import BaseTab from './BaseTab.vue'

export default {
  title: 'UI/BaseTab',
  component: BaseTab,
  argTypes: {
    variant: { control: 'select', options: ['underline', 'pill', 'segment'] },
    size: { control: 'select', options: ['sm', 'md'] },
    active: { control: 'boolean' },
    disabled: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseTab },
  setup: () => ({ args }),
  template: '<BaseTab v-bind="args">{{ args.default }}</BaseTab>'
})

const Row = (args) => ({
  components: { BaseTab },
  setup: () => ({ args }),
  template: `
    <div class="flex gap-1">
      <BaseTab v-for="tab in ['Characters', 'Plot', 'Themes']" :key="tab" v-bind="args" :active="tab === args.activeTab">{{ tab }}</BaseTab>
    </div>
  `
})

export const Underline = Template.bind({})
Underline.args = { default: 'Characters', variant: 'underline' }

export const UnderlineActive = Template.bind({})
UnderlineActive.args = { default: 'Characters', variant: 'underline', active: true }

export const Pill = Template.bind({})
Pill.args = { default: 'Characters', variant: 'pill' }

export const PillActive = Template.bind({})
PillActive.args = { default: 'Characters', variant: 'pill', active: true }

export const Segment = Template.bind({})
Segment.args = { default: 'Characters', variant: 'segment' }

export const SegmentActive = Template.bind({})
SegmentActive.args = { default: 'Characters', variant: 'segment', active: true }

export const TabRow = Row.bind({})
TabRow.args = { variant: 'underline', activeTab: 'Plot' }

export const PillRow = Row.bind({})
PillRow.args = { variant: 'pill', activeTab: 'Plot' }

export const SegmentRow = Row.bind({})
SegmentRow.args = { variant: 'segment', activeTab: 'Plot' }
