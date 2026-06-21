import { inject } from 'vue'

export function useAsyncError() {
  const captureError = inject('captureAsyncError', null)

  function onAsyncError(err) {
    if (captureError) captureError(err)
  }

  async function withAsyncError(fn) {
    try {
      return await fn()
    } catch (err) {
      onAsyncError(err)
      throw err
    }
  }

  return { withAsyncError, onAsyncError }
}
