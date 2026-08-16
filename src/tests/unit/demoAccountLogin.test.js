import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../services/db-core'
import { useAuthStore } from '../../stores/authStore'

// End-to-end proof of the login fix: db-core's on('ready') handler must seed the
// advertised demo account (test / test123) on an empty users table, so that
// LoginView.vue's localLogin path succeeds instead of throwing "Invalid username
// or password".
describe('demo account seeding + localLogin', () => {
  beforeAll(async () => {
    await db.open()
  })

  it('seeds the test user on a fresh database', async () => {
    const found = await db.users.where('username').equals('test').first()
    expect(found).toBeTruthy()
    expect(found.passwordHash).toBe(
      'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae'
    )
  })

  it('localLogin(test, test123) succeeds after seeding', async () => {
    const auth = useAuthStore()
    const session = await auth.localLogin('test', 'test123')
    expect(session.username).toBe('test')
    expect(session.displayName).toBeTruthy()
  })

  it('localLogin rejects a wrong password', async () => {
    const auth = useAuthStore()
    await expect(auth.localLogin('test', 'wrong-password')).rejects.toThrow(
      'Invalid username or password'
    )
  })
})
