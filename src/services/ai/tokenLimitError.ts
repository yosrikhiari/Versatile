export class TokenLimitError extends Error {
  /** Whether the retry machinery may re-attempt this call. False when the
   *  inline halving strategy has exhausted all reductions and the outer
   *  withRetry would only burn quota on the same failure. */
  public retryable = true

  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly currentMaxTokens?: number
  ) {
    super(message)
    this.name = 'TokenLimitError'
  }
}

export class InputBudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly inputTokens: number,
    public readonly budget: number
  ) {
    super(message)
    this.name = 'InputBudgetExceededError'
  }
}
