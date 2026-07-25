import VirtualScrollList from './VirtualScrollList.vue'

export default {
  title: 'Shared/VirtualScrollList',
  component: VirtualScrollList,
  argTypes: {
    itemHeight: { control: 'number' },
    buffer: { control: 'number' },
    keyProp: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { VirtualScrollList },
  setup: () => {
    const items = Array.from({ length: args.itemCount ?? 1000 }, (_, i) => ({
      id: i + 1,
      label: `Item #${i + 1}`,
      detail: `Description for item ${i + 1}`
    }))
    return { args, items }
  },
  template: `
    <div style="height: 400px; border: 1px solid var(--vers-border-subtle); border-radius: 8px;" class="overflow-hidden">
      <VirtualScrollList :items="items" :item-height="args.itemHeight || 88" :buffer="args.buffer || 8" key-prop="id">
        <template #item="{ item }">
          <div class="px-4 py-3 border-b border-border-subtle hover:bg-surface-hover transition-colors">
            <p class="text-sm text-text-primary font-medium">{{ item.label }}</p>
            <p class="text-xs text-text-hint mt-0.5">{{ item.detail }}</p>
          </div>
        </template>
      </VirtualScrollList>
    </div>
  `
})

export const Default = Template.bind({})
Default.args = { itemCount: 1000 }

export const TallItems = Template.bind({})
TallItems.args = { itemCount: 1000, itemHeight: 120 }

export const LargeBuffer = Template.bind({})
LargeBuffer.args = { itemCount: 1000, buffer: 20 }

export const FewItems = Template.bind({})
FewItems.args = { itemCount: 5 }

export const Empty = (args) => ({
  components: { VirtualScrollList },
  setup: () => ({
    items: []
  }),
  template: `
    <div style="height: 400px; border: 1px solid var(--vers-border-subtle); border-radius: 8px;" class="overflow-hidden">
      <VirtualScrollList :items="items" item-height="88" :buffer="8" key-prop="id">
        <template #item="{ item }">
          <div class="px-4 py-3 border-b border-border-subtle">
            <p class="text-sm text-text-primary font-medium">{{ item.label }}</p>
          </div>
        </template>
      </VirtualScrollList>
    </div>
  `
})
