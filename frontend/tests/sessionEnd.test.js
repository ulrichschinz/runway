import { describe, expect, it } from 'vitest'

import { endsSession } from '../src/shared/sessionEnd.js'

/** An axios error as the response interceptor receives it. */
const rejected = (status, { url = '/tasks', token = 'a.jwt.token' } = {}) => ({
  response: { status },
  config: { url, headers: token ? { Authorization: `Bearer ${token}` } : {} },
})

describe('endsSession', () => {
  it('ends the session when a request that carried the token is refused', () => {
    expect(endsSession(rejected(401))).toBe(true)
    expect(endsSession(rejected(401, { url: '/auth/me' }))).toBe(true)
  })

  // The shipped defect: a wrong password answers 401 with "Invalid credentials", the
  // interceptor reloaded /login, and the message was gone before it could be rendered.
  it('leaves a refused login on the page, so its message can be shown', () => {
    expect(endsSession(rejected(401, { url: '/auth/login', token: null }))).toBe(false)
  })

  it('leaves a refused login alone even when a stale token was attached to it', () => {
    expect(endsSession(rejected(401, { url: '/auth/login' }))).toBe(false)
  })

  it('has no session to end when the request carried no token', () => {
    expect(endsSession(rejected(401, { token: null }))).toBe(false)
  })

  it('ignores every other status', () => {
    for (const status of [400, 403, 404, 429, 500]) {
      expect(endsSession(rejected(status))).toBe(false)
    }
  })

  // REV-001 review: a request sent with the pre-change token can come back 401 after the
  // password change committed and the new token was adopted. That 401 is about a token the
  // tab no longer holds, so it must not drop the new one and send the user to /login.
  it('leaves the session alone when the refused request carried a token no longer stored', () => {
    expect(endsSession(rejected(401, { token: 'old.jwt' }), 'new.jwt')).toBe(false)
  })

  it('ends the session when the refused token is the one still stored', () => {
    expect(endsSession(rejected(401, { token: 'cur.jwt' }), 'cur.jwt')).toBe(true)
  })

  it('ends the session when no token is stored any more, as there is nothing to keep', () => {
    expect(endsSession(rejected(401, { token: 'old.jwt' }), null)).toBe(true)
  })

  it('ignores an error without a response or without a request', () => {
    expect(endsSession(new Error('Network Error'))).toBe(false)
    expect(endsSession({ response: { status: 401 } })).toBe(false)
    expect(endsSession(undefined)).toBe(false)
  })
})
