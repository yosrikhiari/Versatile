import { inject } from 'vue'

export function useAsyncError() {
  const captureError = inject<((err: any) => void) | null>('captureAsyncError', null)

  function onAsyncError(err: any) {
    if (captureError) captureError(err)
  }

  async function withAsyncError(fn: any) {
    try {
      return await fn()
    } catch (err) {
      onAsyncError(err)
      throw err
    }
  }

  return { withAsyncError, onAsyncError }
}
