/**
 * Judge-calibration metrics for the P0-A gate harness.
 *
 * Pure functions over already-collected labels and verdicts — no models, no
 * I/O — so they are unit-tested here and reused by
 * `tools/judge-bench/calibrate.mjs` once the 40-scene hand-label set exists.
 * Conventions for degenerate inputs are documented per function; the harness
 * must surface NaN (uninformative labels) rather than average it away.
 */

/** Require equal, non-empty paired inputs. */
function checkPaired(a: readonly unknown[], b: readonly unknown[]): void {
  if (a.length !== b.length) throw new Error(`Mismatched pair lengths: ${a.length} vs ${b.length}.`)
  if (a.length === 0) throw new Error('Empty input.')
}

/**
 * Cohen's kappa for two raters over nominal categories (e.g. Problem/Fine).
 * Returns NaN when agreement is vacuous (both raters used a single category,
 * so expected agreement is 1) — the harness must flag that, not average it.
 */
export function cohensKappa(a: readonly string[], b: readonly string[]): number {
  checkPaired(a, b)
  const categories = [...new Set([...a, ...b])]
  let observed = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) observed++
  }
  const po = observed / a.length
  let pe = 0
  for (const category of categories) {
    const pa = a.filter((x) => x === category).length / a.length
    const pb = b.filter((x) => x === category).length / b.length
    pe += pa * pb
  }
  if (pe === 1) return NaN
  return (po - pe) / (1 - pe)
}

/**
 * Position consistency (Shi et al.): fraction of items judged identically
 * across presentation orders. The gate harness requires >= 0.85.
 */
export function swapAgreement(first: readonly string[], second: readonly string[]): number {
  checkPaired(first, second)
  let agree = 0
  for (let i = 0; i < first.length; i++) {
    if (first[i] === second[i]) agree++
  }
  return agree / first.length
}

/**
 * Pearson correlation (e.g. score vs response length for verbosity bias).
 * The gate harness requires |r| < 0.3. Returns NaN on zero variance.
 */
export function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  checkPaired(xs, ys)
  const n = xs.length
  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n
  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - meanX) * (ys[i] - meanY)
    varX += (xs[i] - meanX) ** 2
    varY += (ys[i] - meanY) ** 2
  }
  if (varX === 0 || varY === 0) return NaN
  return cov / Math.sqrt(varX * varY)
}

export interface PrecisionRecall {
  precision: number
  recall: number
  f1: number
}

/**
 * Defect-detection quality of gate verdicts against hand labels. Vacuous
 * inputs (no predicted and no actual defects) score 1 — nothing to catch and
 * nothing caught is perfect, not a failure.
 */
export function precisionRecallF1(
  predicted: readonly boolean[],
  actual: readonly boolean[]
): PrecisionRecall {
  checkPaired(predicted, actual)
  let tp = 0
  let fp = 0
  let fn = 0
  for (let i = 0; i < predicted.length; i++) {
    if (predicted[i] && actual[i]) tp++
    else if (predicted[i]) fp++
    else if (actual[i]) fn++
  }
  if (tp + fp + fn === 0) return { precision: 1, recall: 1, f1: 1 }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1 }
}

/** Fraction of scenes passing the gate. Informational; never a quality claim. */
export function passRate(passes: readonly boolean[]): number {
  if (passes.length === 0) throw new Error('Empty input.')
  return passes.filter(Boolean).length / passes.length
}

/**
 * Linearly weighted Cohen's kappa for three ORDERED classes
 * (pass < revise < rewrite). Near misses (off by one) count half as much as
 * full flips (off by two): w[i][j] = |i-j| / 2.
 * Returns NaN when expected disagreement is 0 (vacuous single-category
 * labels) — same convention as cohensKappa.
 */
export function weightedKappa(
  a: readonly string[],
  b: readonly string[],
  classes: readonly [string, string, string]
): number {
  checkPaired(a, b)
  const n = a.length
  const k = classes.length
  const indexOf = (label: string): number => {
    const idx = classes.indexOf(label)
    if (idx === -1) throw new Error(`Unknown label: ${label}.`)
    return idx
  }
  const counts: number[][] = Array.from({ length: k }, () => Array(k).fill(0))
  const rowSums: number[] = Array(k).fill(0)
  const colSums: number[] = Array(k).fill(0)
  for (let i = 0; i < n; i++) {
    const r = indexOf(a[i])
    const c = indexOf(b[i])
    counts[r][c]++
    rowSums[r]++
    colSums[c]++
  }
  let qo = 0
  let qe = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = Math.abs(i - j) / (k - 1)
      qo += (w * counts[i][j]) / n
      qe += w * (rowSums[i] / n) * (colSums[j] / n)
    }
  }
  if (qe === 0) return NaN
  return 1 - qo / qe
}

/**
 * Wilson score interval (95%, z = 1.96) for a binomial proportion k/n.
 * Returns [NaN, NaN] when n is 0 (nothing observed) — the harness must flag
 * that, not average it.
 */
export function wilsonCI(k: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN]
  const z = 1.96
  const z2 = z * z
  const p = k / n
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const delta = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return [Math.max(0, centre - delta), Math.min(1, centre + delta)]
}

/**
 * Per-class agreement (recall against hand labels) with support counts.
 * Classes with no support score NaN agreement — uninformative, not perfect.
 */
export function perClassAgreement(
  actual: readonly string[],
  predicted: readonly string[],
  classes: readonly string[]
): Record<string, { agreement: number; support: number }> {
  checkPaired(actual, predicted)
  const result: Record<string, { agreement: number; support: number }> = {}
  for (const c of classes) {
    let support = 0
    let correct = 0
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] === c) {
        support++
        if (predicted[i] === c) correct++
      }
    }
    result[c] = { agreement: support === 0 ? NaN : correct / support, support }
  }
  return result
}
