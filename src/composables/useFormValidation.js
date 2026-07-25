import { reactive, computed } from 'vue'

/**
 * useFormValidation — lightweight, dependency-free form validation (M-7.3).
 *
 * Define fields with an initial value and a list of rule functions. Each rule
 * takes the current value (and the whole form values) and returns `true` when
 * valid or a string error message when invalid. Errors surface only after a
 * field is "touched" (blurred) or after `validate()` is called, so the form
 * doesn't shout at the user mid-typing.
 *
 * Usage:
 *   const form = useFormValidation({
 *     email: { value: '', rules: [rules.required(), rules.email()] },
 *     name:  { value: '', rules: [rules.required(), rules.maxLength(80)] }
 *   })
 *   form.values.email = 'x'
 *   form.touch('email')
 *   form.errors.email            // -> message or ''
 *   if (form.validate()) submit(form.values)
 */

// --- reusable rule factories ------------------------------------------------

export const rules = {
  required:
    (message = 'This field is required') =>
    (v) =>
      (v !== null && v !== undefined && String(v).trim() !== '') || message,

  minLength: (n, message) => (v) =>
    String(v ?? '').length >= n || message || `Must be at least ${n} characters`,

  maxLength: (n, message) => (v) =>
    String(v ?? '').length <= n || message || `Must be at most ${n} characters`,

  email:
    (message = 'Enter a valid email address') =>
    (v) =>
      !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) || message,

  pattern:
    (re, message = 'Invalid format') =>
    (v) =>
      !v || re.test(String(v)) || message,

  min: (n, message) => (v) =>
    v === '' || v === null || Number(v) >= n || message || `Must be ≥ ${n}`,

  max: (n, message) => (v) =>
    v === '' || v === null || Number(v) <= n || message || `Must be ≤ ${n}`,

  // Cross-field: `getOther` returns the value to match against.
  matches:
    (getOther, message = 'Values do not match') =>
    (v) =>
      v === getOther() || message
}

export function useFormValidation(schema) {
  const keys = Object.keys(schema)

  const values = reactive(Object.fromEntries(keys.map((k) => [k, schema[k].value ?? ''])))
  const touched = reactive(Object.fromEntries(keys.map((k) => [k, false])))

  function runRules(key) {
    const fieldRules = schema[key].rules || []
    for (const rule of fieldRules) {
      const result = rule(values[key], values)
      if (result !== true) return typeof result === 'string' ? result : 'Invalid'
    }
    return ''
  }

  // Errors are only shown for touched fields; validate() flips all to touched.
  const errors = computed(() =>
    Object.fromEntries(keys.map((k) => [k, touched[k] ? runRules(k) : '']))
  )

  // True error state regardless of touched — used by validate() / isValid.
  const rawErrors = computed(() => Object.fromEntries(keys.map((k) => [k, runRules(k)])))

  const isValid = computed(() => Object.values(rawErrors.value).every((e) => e === ''))

  function touch(key) {
    if (key in touched) touched[key] = true
  }

  function touchAll() {
    keys.forEach((k) => (touched[k] = true))
  }

  /** Mark everything touched and return whether the form is valid. */
  function validate() {
    touchAll()
    return isValid.value
  }

  function reset() {
    keys.forEach((k) => {
      values[k] = schema[k].value ?? ''
      touched[k] = false
    })
  }

  return { values, errors, touched, isValid, touch, touchAll, validate, reset }
}
