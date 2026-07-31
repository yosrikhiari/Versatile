let counter = 0

/**
 * Stable, collision-free DOM id for wiring `<label for>` / `aria-labelledby`
 * inside a component.
 *
 * Vue's own `useId()` would do this, but it landed in 3.5 and this package
 * still declares `vue: ^3.4.0` — a clean install can legally resolve below
 * that. This has no such floor.
 *
 * Not SSR-safe (server and client counters diverge); this app is client-only.
 */
export function domId(prefix = 'vers'): string {
  counter += 1
  return `${prefix}-${counter}`
}
