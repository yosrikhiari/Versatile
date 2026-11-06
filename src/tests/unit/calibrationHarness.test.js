import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'tools/judge-bench/calibrate.mjs')

describe('P0-A calibration CLI safety', () => {
  it('defaults to a dry run without loading labels or calling a model', () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('dry run only')
    expect(result.stdout).not.toContain('Calibrating judge')
  })

  it('requires explicit approval and two distinct named adjudicators', () => {
    const result = spawnSync(process.execPath, [script, '--run'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('two distinct named human adjudicators')
    expect(result.stdout).not.toContain('Calibrating judge')
  })
})
