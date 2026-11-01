import { describe, expect, it } from 'vitest'

import { loginHref, loginRedirect, safeNext, taskParam } from '../src/shared/returnPath.js'

const UUID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

describe('safeNext', () => {
  it.each([
    '/next',
    '/next?task=' + UUID,
    '/projects/Website-Relaunch',
    '/projects/B%C3%BCro?ui=neu#x',
    '/',
  ])('follows the same-origin relative path %s', (path) => {
    expect(safeNext(path)).toBe(path)
  })

  it.each([
    ['protocol-relative', '//evil.example/next'],
    ['backslash, read as // by browsers', '/\\evil.example'],
    ['backslash later in the path', '/next\\..\\x'],
    ['absolute URL', 'https://evil.example/next'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative without a slash', 'next'],
    ['tab hiding a second slash', '/\t/evil.example'],
    ['newline', '/next\n'],
    ['empty', ''],
  ])('refuses %s', (_, value) => {
    expect(safeNext(value)).toBeNull()
  })

  it('refuses a return to the login page itself', () => {
    expect(safeNext('/login')).toBeNull()
    expect(safeNext('/login?next=/next')).toBeNull()
  })

  it('refuses anything that is not one string', () => {
    expect(safeNext(undefined)).toBeNull()
    expect(safeNext(null)).toBeNull()
    expect(safeNext(['/next', '/inbox'])).toBeNull()
    expect(safeNext(42)).toBeNull()
  })
})

describe('taskParam', () => {
  it('accepts a uuid and lower-cases it', () => {
    expect(taskParam(UUID)).toBe(UUID)
    expect(taskParam(UUID.toUpperCase())).toBe(UUID)
  })

  it.each([
    ['too short', UUID.slice(0, -1)],
    ['not hex', UUID.replace('3f', 'zz')],
    ['extra text', UUID + 'x'],
    ['a path', '../' + UUID],
    ['a number', 42],
    ['repeated parameter', [UUID, UUID]],
    ['missing', undefined],
  ])('refuses %s', (_, value) => {
    expect(taskParam(value)).toBeNull()
  })
})

describe('loginRedirect', () => {
  it('carries the full visited path', () => {
    expect(loginRedirect(`/next?task=${UUID}`)).toEqual({ path: '/login', query: { next: `/next?task=${UUID}` } })
  })

  it('carries nothing for the start page or a path it would not follow', () => {
    expect(loginRedirect('/')).toEqual({ path: '/login' })
    expect(loginRedirect('//evil.example')).toEqual({ path: '/login' })
  })
})

describe('loginHref (401 on a stale token)', () => {
  it('carries the visited path, encoded, and decodes back to it', () => {
    const path = '/next?task=' + UUID + '&ui=neu#x'
    const href = loginHref(path)
    expect(href).toBe('/login?next=' + encodeURIComponent(path))
    const next = new URL(href, 'http://runway.invalid').searchParams.get('next')
    expect(next).toBe(path)
    expect(safeNext(next)).toBe(path)
  })
  it.each(['/', '/login', '/login?next=/next', '//evil.example/next', ''])('plain /login for %j', (path) => {
    expect(loginHref(path)).toBe('/login')
  })
})
