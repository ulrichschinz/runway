import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A pin of the checked-in text, NOT proof of what the running proxy does: nginx.conf is templated
// by envsubst at start (BLIND-NGINX-001) and the TLS terminator in front of it is outside this
// repository. What the backend enforces itself is tested in backend/tests/unit/test_password_kdf.py.
const conf = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

function block(location) {
  const start = conf.indexOf(`location ${location} {`)
  expect(start, `location ${location}`).toBeGreaterThanOrEqual(0)
  return conf.slice(start, conf.indexOf('\n    }', start))
}

describe('the auth routes have their own body limit at nginx (SEC-006, brief 0067)', () => {
  it('caps /api/auth/ at 16k and still proxies it to the backend under /auth/', () => {
    const auth = block('/api/auth/')
    expect(auth).toMatch(/client_max_body_size 16k;/)
    expect(auth).toMatch(/proxy_pass http:\/\/\$\{BACKEND_HOST\}:8000\/auth\/;/)
  })

  it('comes before the general /api/ block and leaves its default alone', () => {
    expect(conf.indexOf('location /api/auth/ {')).toBeLessThan(conf.indexOf('location /api/ {'))
    expect(block('/api/')).not.toMatch(/client_max_body_size/)
  })

  it('substitutes nothing but BACKEND_HOST', () => {
    const vars = [...conf.matchAll(/\$\{([A-Z_]+)\}/g)].map((m) => m[1])
    expect(new Set(vars)).toEqual(new Set(['BACKEND_HOST']))
  })
})
