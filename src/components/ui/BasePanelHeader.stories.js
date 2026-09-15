import BasePanelHeader from './BasePanelHeader.vue'
import BaseButton from './BaseButton.vue'
import BaseChip from './BaseChip.vue'

export default {
  title: 'UI/BasePanelHeader',
  component: BasePanelHeader,
  argTypes: {
    title: { control: 'text' },
    icon: { control: 'text' },
    meta: { control: 'text' },
    collapsible: { control: 'boolean' },
    collapsed: { control: 'boolean' },
    closable: { control: 'boolean' }
  }
}

const Template = (args) => ({
  components: { BasePanelHeader },
  setup: () => ({ args }),
  template: '<div class="w-[420px] bg-bg-panel"><BasePanelHeader v-bind="args" /></div>'
})

export const Default = Template.bind({})
Default.args = { title: 'Consistency', icon: 'shield-check' }

export const WithMeta = Template.bind({})
WithMeta.args = { title: 'Beta reader', icon: 'users', meta: '3 findings, 2 min ago' }

export const Collapsible = Template.bind({})
Collapsible.args = { title: 'Story shape', icon: 'chart', collapsible: true, collapsed: false }

export const Closable = Template.bind({})
Closable.args = { title: 'What if', icon: 'sparkles', closable: true, meta: 'scene 12' }

export const WithActions = () => ({
  components: { BasePanelHeader, BaseButton, BaseChip },
  template: `
    <div class="w-[520px] bg-bg-panel">
      <BasePanelHeader title="Story tools" icon="wand" meta="chapter 4, 2,310 words" closable>
        <template #actions>
          <BaseChip variant="filter" active size="sm">Scene</BaseChip>
          <BaseButton variant="ghost" size="sm" icon="refresh-cw">Re-run</BaseButton>
        </template>
      </BasePanelHeader>
    </div>`
})

export const TightRow = () => ({
  components: { BasePanelHeader, BaseButton },
  template: `
    <div class="w-[300px] bg-bg-panel">
      <BasePanelHeader title="Timeline" icon="clock" meta="14 events across 3 threads: the meta yields before the title when the row is tight" closable>
        <template #actions><BaseButton variant="ghost" size="sm" icon="filter">Filter</BaseButton></template>
      </BasePanelHeader>
    </div>`
})
