import { ref } from 'vue'
import BaseSection from './BaseSection.vue'
import BaseButton from './BaseButton.vue'
import BaseSwitch from './BaseSwitch.vue'

export default {
  title: 'UI/BaseSection',
  component: BaseSection,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    meta: { control: 'text' },
    first: { control: 'boolean' },
    dense: { control: 'boolean' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BaseSection },
  setup: () => ({ args }),
  template:
    '<div class="w-[420px] bg-bg-panel px-4"><BaseSection v-bind="args"><p class="text-xs text-text-secondary">{{ args.default }}</p></BaseSection></div>'
})

export const Default = Template.bind({})
Default.args = {
  title: 'Findings',
  description: 'Contradictions with the story bible, newest first.',
  default: 'Section content goes here.'
}

export const First = Template.bind({})
First.args = { title: 'Summary', first: true, default: 'The first section has no top hairline.' }

export const Dense = Template.bind({})
Dense.args = { title: 'Options', dense: true, default: 'Tighter vertical rhythm for option rows.' }

export const WithMeta = Template.bind({})
WithMeta.args = {
  title: 'Scenes reviewed',
  meta: '12 of 14',
  default: 'Meta sits at the right of the title row.'
}

export const Stacked = () => ({
  components: { BaseSection, BaseButton, BaseSwitch },
  setup: () => ({ gate: ref(true) }),
  template: `
    <div class="w-[440px] bg-bg-panel px-4 pb-4">
      <BaseSection title="Brief" description="What has to happen in this scene." first>
        <p class="text-xs text-text-secondary">Ilse reaches the harbour before the tide turns.</p>
      </BaseSection>
      <BaseSection title="Gates" meta="2 on">
        <template #actions><BaseButton variant="ghost" size="sm">Reset</BaseButton></template>
        <BaseSwitch v-model="gate" label="Consistency" description="Warns, never discards." />
      </BaseSection>
      <BaseSection title="Run" dense>
        <BaseButton variant="primary" size="sm" icon="play">Write the scene</BaseButton>
      </BaseSection>
    </div>`
})
