import { describe, expect, it } from 'vitest'
import { landingAfterLogin, PASSWORD_GIVEN_MAX_BYTES, PASSWORD_MAX_BYTES, PASSWORD_MIN_BYTES, passwordProblem, utf8Bytes } from '../src/shared/passwordPolicy.js'

// The server's password rule (SEC-006, ADR 0044 Decision 5, brief 0067), mirrored so the page can
// say why before anything is sent. The server stays the authority: it answers 422 either way.
describe('utf8Bytes', () => {
  it('counts bytes, not characters', () => {
    expect(utf8Bytes('abc')).toBe(3)
    expect(utf8Bytes('ä')).toBe(2)
    expect(utf8Bytes('🔑')).toBe(4)
    expect(utf8Bytes('')).toBe(0)
  })
})

describe('passwordProblem', () => {
  it('has the server limits', () => {
    expect([PASSWORD_MIN_BYTES, PASSWORD_MAX_BYTES]).toEqual([8, 1024])
  })

  it('a new password needs at least 8 bytes, counted in UTF-8', () => {
    expect(passwordProblem('seven77', { isNew: true })).toBe('pw.tooShort')
    expect(passwordProblem('acht8888', { isNew: true })).toBeNull()
    expect(passwordProblem('ääää', { isNew: true })).toBeNull()
  })

  it('a password being set may not exceed 1024 bytes', () => {
    expect(passwordProblem('a'.repeat(1024), { isNew: true })).toBeNull()
    expect(passwordProblem('a'.repeat(1025), { isNew: true })).toBe('pw.tooLong')
    expect(passwordProblem('ä'.repeat(513), { isNew: true })).toBe('pw.tooLong')
  })

  // Brief 0067, R7: the previous image accepted up to 4096 bytes at login (bcrypt read 72), so a
  // password typed to log in or as the current one may be that long; one being set may not.
  it('a password being given (login, current) may be up to 4096 bytes', () => {
    expect(PASSWORD_GIVEN_MAX_BYTES).toBe(4096)
    expect(passwordProblem('a'.repeat(1025), { isNew: false })).toBeNull()
    expect(passwordProblem('a'.repeat(4096), { isNew: false })).toBeNull()
    expect(passwordProblem('a'.repeat(4097), { isNew: false })).toBe('pw.givenTooLong')
    expect(passwordProblem('ä'.repeat(2049), { isNew: false })).toBe('pw.givenTooLong')
  })

  it('a login keeps no minimum, so an old short password still works', () => {
    expect(passwordProblem('pw', { isNew: false })).toBeNull()
  })
})

describe('landingAfterLogin', () => {
  it('sends a bcrypt-era long password to Einstellungen, whatever next said', () => {
    expect(landingAfterLogin({ password_change_required: true }, '/next?task=1')).toBe('/settings?password=change')
  })

  it('otherwise goes where the login was going', () => {
    expect(landingAfterLogin({ password_change_required: false }, '/next')).toBe('/next')
    expect(landingAfterLogin({}, null)).toBe('/')
    expect(landingAfterLogin(undefined, '/all')).toBe('/all')
  })
})
