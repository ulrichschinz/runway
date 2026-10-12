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

  it('ignores an error without a response or without a request', () => {
    expect(endsSession(new Error('Network Error'))).toBe(false)
    expect(endsSession({ response: { status: 401 } })).toBe(false)
    expect(endsSession(undefined)).toBe(false)
  })
})
