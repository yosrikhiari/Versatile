import { describe, it, expect } from 'vitest'
import { useFormValidation, rules } from '@/composables/useFormValidation'

describe('useFormValidation', () => {
  function makeForm() {
    return useFormValidation({
      email: { value: '', rules: [rules.required(), rules.email()] },
      name: { value: '', rules: [rules.required(), rules.maxLength(5)] }
    })
  }

  it('starts valid=false when required fields empty, but hides errors until touched', () => {
    const form = makeForm()
    expect(form.isValid.value).toBe(false)
    expect(form.errors.value.email).toBe('') // untouched → hidden
  })

  it('surfaces errors after touch', () => {
    const form = makeForm()
    form.touch('email')
    expect(form.errors.value.email).toBe('This field is required')
  })

  it('validate() touches all and returns validity', () => {
    const form = makeForm()
    expect(form.validate()).toBe(false)
    expect(form.errors.value.email).toBeTruthy()
    expect(form.errors.value.name).toBeTruthy()
  })

  it('passes when values satisfy rules', () => {
    const form = makeForm()
    form.values.email = 'a@b.co'
    form.values.name = 'Sam'
    expect(form.validate()).toBe(true)
    expect(form.errors.value.email).toBe('')
  })

  it('enforces maxLength', () => {
    const form = makeForm()
    form.values.name = 'TooLongName'
    form.touch('name')
    expect(form.errors.value.name).toContain('at most 5')
  })

  it('rejects malformed email', () => {
    const form = makeForm()
    form.values.email = 'not-an-email'
    form.touch('email')
    expect(form.errors.value.email).toBe('Enter a valid email address')
  })

  it('reset restores initial state', () => {
    const form = makeForm()
    form.values.email = 'a@b.co'
    form.touchAll()
    form.reset()
    expect(form.values.email).toBe('')
    expect(form.touched.email).toBe(false)
  })

  it('matches rule compares two fields', () => {
    const form = useFormValidation({
      pw: { value: 'secret', rules: [] },
      confirm: { value: '', rules: [rules.matches(() => form.values.pw, 'Passwords must match')] }
    })
    form.values.confirm = 'nope'
    form.touch('confirm')
    expect(form.errors.value.confirm).toBe('Passwords must match')
    form.values.confirm = 'secret'
    expect(form.errors.value.confirm).toBe('')
  })
})
