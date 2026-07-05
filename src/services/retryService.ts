const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /rate limit/i,
  /429/i,
  /5\d{2}/i,
  /too many requests/i,
  /service unavailable/i,
  /internal server error/i,
  /bad gateway/i,
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /network/i,
  /socket/i
]

function isRetryable(error: unknown): boolean {
  const message = (error as Error)?.message || ''
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(message))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
}

async function withRetry<T>(
  fn: (attempt: number, isIntermediate: boolean) => Promise<T>,
  isRetryableFn: (error: unknown) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const retryDelay = options.retryDelay ?? 1000
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const jitter = Math.random() * retryDelay
      await sleep(retryDelay * Math.pow(2, attempt - 1) + jitter)
    }

    try {
      return await fn(attempt, attempt < maxRetries)
    } catch (error) {
      lastError = error
      if (isRetryableFn(error) && attempt < maxRetries) {
        continue
      }
      throw error
    }
  }

  throw lastError
}

export { isRetryable, withRetry }
