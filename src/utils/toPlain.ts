import { toRaw, isRef, unref } from 'vue'

/**
 * Deep-convert a reactive value into plain data that IndexedDB can store.
 *
 * `structuredClone` — which Dexie uses under the hood — throws `DataCloneError`
 * on a Proxy, and Vue's `ref({ … })` proxies *every* nested object and array.
 * Vue's own `toRaw` only unwraps the outer level, so an object whose fields are
 * plain but whose `tags: []` is still reactive gets past a `toRaw` and then
 * fails at the write.
 *
 * Functions, symbols and class instances are not handled: this is for the
 * serialisable records the stores persist, not arbitrary values.
 */
export function toPlain<T>(value: T): T {
  const seen = new WeakMap<object, any>()

  const convert = (input: any): any => {
    const raw = toRaw(isRef(input) ? unref(input) : input)

    if (raw === null || typeof raw !== 'object') return raw
    if (raw instanceof Date) return new Date(raw.getTime())
    if (raw instanceof Blob || raw instanceof ArrayBuffer) return raw

    // Shared references and cycles must not be expanded twice.
    if (seen.has(raw)) return seen.get(raw)

    if (Array.isArray(raw)) {
      const out: any[] = []
      seen.set(raw, out)
      for (const item of raw) out.push(convert(item))
      return out
    }

    const out: Record<string, any> = {}
    seen.set(raw, out)
    for (const key of Object.keys(raw)) out[key] = convert(raw[key])
    return out
  }

  return convert(value)
}
