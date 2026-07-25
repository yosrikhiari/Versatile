import NotificationHost from './NotificationHost.vue'
import { useNotifications } from '../../composables/useNotifications'

export default {
  title: 'Shared/NotificationHost',
  component: NotificationHost,
  argTypes: {
    toasts: { control: 'object' },
    activeConfirm: { control: 'object' }
  }
}

const mockToasts = [
  { id: '1', type: 'success', message: 'Background saved successfully', timestamp: Date.now() },
  { id: '2', type: 'info', message: 'Generating chapter outline…', timestamp: Date.now() - 2000 },
  {
    id: '3',
    type: 'warning',
    message: 'Low embedding quality — consider revising',
    timestamp: Date.now() - 5000
  },
  { id: '4', type: 'error', message: 'Failed to sync with server', timestamp: Date.now() - 8000 }
]

const confirmDialog = {
  id: 'c1',
  type: 'danger',
  title: 'Delete Chapter',
  message: 'This action cannot be undone. All content in this chapter will be permanently removed.',
  confirmLabel: 'Delete',
  cancelLabel: 'Keep',
  onConfirm: () => {},
  onCancel: () => {}
}

const Template = (args) => ({
  components: { NotificationHost },
  setup() {
    const { toasts, activeConfirm } = useNotifications()
    toasts.value = args.toasts
    activeConfirm.value = args.activeConfirm
    return {}
  },
  template: '<NotificationHost />'
})

export const Default = Template.bind({})
Default.args = {
  toasts: mockToasts,
  activeConfirm: null
}

export const WithConfirm = Template.bind({})
WithConfirm.args = {
  toasts: mockToasts.slice(0, 1),
  activeConfirm: confirmDialog
}

export const SingleToast = Template.bind({})
SingleToast.args = {
  toasts: [mockToasts[0]],
  activeConfirm: null
}

export const Empty = Template.bind({})
Empty.args = {
  toasts: [],
  activeConfirm: null
}
