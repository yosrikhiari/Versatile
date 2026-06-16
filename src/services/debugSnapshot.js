const DEBUG_ENDPOINT = '/__debug/snapshot'

let seqCounter = 0

export function debugSnapshot(stage, data = {}, options = {}) {
  const seq = ++seqCounter
  const label = options.label || stage
  try {
    fetch(DEBUG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage,
        data: {
          _seq: seq,
          _ts: Date.now(),
          _label: label,
          ...data
        }
      })
    }).catch(() => console.warn('[debugSnapshot] POST failed'))
  } catch {}
}
