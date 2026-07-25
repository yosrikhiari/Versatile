import { ref } from 'vue'
import Modal from './Modal.vue'

export default {
  title: 'Shared/Modal',
  component: Modal,
  argTypes: {
    show: { control: 'boolean' },
    backdropClass: { control: 'text' },
    panelClass: { control: 'text' },
    maxWidth: { control: 'text' },
    ariaLabel: { control: 'text' },
    default: { control: 'text' }
  }
}

const Template = (args) => ({
  components: { Modal },
  setup: () => {
    const localShow = ref(false)
    return { args, localShow }
  },
  template: `
    <div>
      <button @click="localShow = true" class="px-3 py-1.5 bg-accent text-bg-primary rounded-lg text-xs font-medium">Open Modal</button>
      <Modal v-bind="args" :show="localShow" @close="localShow = false">
        {{ args.default }}
      </Modal>
    </div>
  `
})

const WithContent = (args) => ({
  components: { Modal },
  setup: () => {
    const localShow = ref(false)
    return { args, localShow }
  },
  template: `
    <div>
      <button @click="localShow = true" class="px-3 py-1.5 bg-accent text-bg-primary rounded-lg text-xs font-medium">Open Modal</button>
      <Modal v-bind="args" :show="localShow" @close="localShow = false">
        <div class="p-4">
          <h2 class="text-sm font-semibold text-text-primary mb-2">Modal Title</h2>
          <p class="text-xs text-text-secondary mb-4">This is the modal body content. It can contain any Vue template content.</p>
          <div class="flex justify-end gap-2">
            <button @click="localShow = false" class="px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded-lg text-xs">Cancel</button>
            <button @click="localShow = false" class="px-3 py-1.5 bg-accent text-bg-primary rounded-lg text-xs">Confirm</button>
          </div>
        </div>
      </Modal>
    </div>
  `
})

export const Basic = Template.bind({})
Basic.args = { default: 'Modal content', maxWidth: 'max-w-sm' }

export const WithHeaderAndFooter = WithContent.bind({})
WithHeaderAndFooter.args = { maxWidth: 'max-w-md' }

export const Wide = WithContent.bind({})
Wide.args = { maxWidth: 'max-w-lg' }

export const DisabledBackdropClose = Template.bind({})
DisabledBackdropClose.args = {
  closeOnBackdrop: false,
  default: 'Click backdrop — nothing happens',
  maxWidth: 'max-w-sm'
}
