import ErrorBoundary from './ErrorBoundary.vue'

export default {
  title: 'Shared/ErrorBoundary',
  component: ErrorBoundary,
  argTypes: {
    fallbackTitle: { control: 'text' },
    fallbackDescription: { control: 'text' }
  }
}

const Normal = (args) => ({
  components: { ErrorBoundary },
  setup: () => ({ args }),
  template: `
    <ErrorBoundary v-bind="args">
      <div class="p-4 bg-bg-tertiary rounded-lg text-text-primary text-sm">This content renders fine</div>
    </ErrorBoundary>
  `
})

const ErrorThrowing = (args) => ({
  components: { ErrorBoundary },
  setup: () => ({
    args,
    throwError() {
      throw new Error('Simulated error')
    }
  }),
  template: `
    <ErrorBoundary v-bind="args">
      <div class="p-4 bg-bg-tertiary rounded-lg">
        <p class="text-text-primary text-sm mb-2">Click the button to trigger an error boundary:</p>
        <button @click="throwError" class="px-3 py-1.5 bg-danger text-white rounded-lg text-xs">Trigger Error</button>
      </div>
    </ErrorBoundary>
  `
})

export const Default = Normal.bind({})
Default.args = {}

export const CustomFallback = ErrorThrowing.bind({})
CustomFallback.args = {
  fallbackTitle: 'Oops!',
  fallbackDescription: 'A component crashed. You can try recovering below.'
}
