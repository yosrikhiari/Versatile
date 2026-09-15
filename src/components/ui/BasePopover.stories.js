import BasePopover from './BasePopover.vue'
import BaseButton from './BaseButton.vue'

export default {
  title: 'UI/BasePopover',
  component: BasePopover,
  argTypes: {
    placement: { control: 'select', options: ['top', 'bottom', 'right', 'left'] },
    align: { control: 'select', options: ['start', 'end'] },
    offset: { control: 'number' },
    width: { control: 'number' },
    label: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { BasePopover, BaseButton },
  setup: () => ({ args }),
  template: `
    <div class="flex h-64 items-center justify-center">
      <BasePopover v-bind="args">
        <template #trigger="{ toggle, open }">
          <BaseButton variant="elevated" icon="more-horizontal" @click="toggle">{{ open ? 'Close' : 'Options' }}</BaseButton>
        </template>
        <template #default="{ close }">
          <div class="flex flex-col gap-1 p-1">
            <button class="rounded px-2 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover" @click="close">Rename scene</button>
            <button class="rounded px-2 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover" @click="close">Duplicate</button>
            <button class="rounded px-2 py-1.5 text-left text-xs text-danger hover:bg-bg-hover" @click="close">Delete</button>
          </div>
        </template>
      </BasePopover>
    </div>`
})

export const Top = Template.bind({})
Top.args = { placement: 'top', align: 'start' }

export const Bottom = Template.bind({})
Bottom.args = { placement: 'bottom', align: 'start' }

export const BottomEnd = Template.bind({})
BottomEnd.args = { placement: 'bottom', align: 'end' }

export const Right = Template.bind({})
Right.args = { placement: 'right', align: 'start', width: 220 }

export const Left = Template.bind({})
Left.args = { placement: 'left', align: 'start', width: 220 }
